import os
import math
import datetime
import re
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, Header, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector
from mysql.connector import pooling
import jwt
from passlib.context import CryptContext
import requests
import bcrypt
# Correção para incompatibilidade do passlib com versões recentes do bcrypt
bcrypt.__about__ = type('about', (), {'__version__': bcrypt.__version__})

# --- CONFIGURAÇÕES DE SEGURANÇA E BANCO DE DADOS ---
SECRET_KEY = os.getenv("SECRET_KEY", "sua_chave_secreta_super_segura_para_o_tcc")
ALGORITHM = "HS256"
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY", "")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASS", ""),
    "database": os.getenv("DB_NAME", "detector_ia")
}

try:
    db_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="detector_pool",
        pool_size=5,
        **DB_CONFIG
    )
except Exception as e:
    print(f"Aviso: Pool do MySQL não iniciado: {e}")
    db_pool = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(
    title="DetectorIA API - Análise Avançada de Autoria",
    description="API com controle de acesso, logs de auditoria e integração com API externa de PLN.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    if db_pool:
        try:
            return db_pool.get_connection()
        except Exception:
            pass
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Exception as e:
        print(f"Erro no banco: {e}")
        return None

# --- MODELS ---
class UsuarioCadastro(BaseModel):
    nome: str
    email: str
    senha: str
    aceite_lgpd: bool

class UsuarioLogin(BaseModel):
    email: str
    senha: str

class TextoAnalise(BaseModel):
    texto: str

# --- AUXILIARES JWT, LOGS & INTEGRAÇÃO COM API EXTERNA ---
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

def registrar_log(usuario_email: str, acao: str, status_log: str, request: Optional[Request] = None):
    ip_origem = request.client.host if (request and request.client) else "127.0.0.1"
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                query = "INSERT INTO logs (data_hora, usuario_email, acao, ip_origem, status) VALUES (%s, %s, %s, %s, %s)"
                cursor.execute(query, (datetime.datetime.now(), usuario_email, acao, ip_origem, status_log))
                conn.commit()
        except Exception as e:
            print(f"Erro ao registrar log: {e}")
        finally:
            conn.close()

# INTEGRAÇÃO COM API EXTERNA DE ANÁLISE DE LINGUAGEM (HuggingFace / External Service)
def consultar_api_externa_pln(texto: str) -> dict:
    """
    Consumo funcional da API Externa da HuggingFace (Model RoBERTa / Classifier)
    com fallback seguro em caso de timeout.
    """
    url = "https://api-inference.huggingface.co/models/roberta-base-openai-detector"
    headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"} if HUGGINGFACE_API_KEY else {}
    
    try:
        response = requests.post(url, headers=headers, json={"inputs": texto[:500]}, timeout=3.0)
        if response.status_code == 200:
            res_json = response.json()
            if isinstance(res_json, list) and len(res_json) > 0 and isinstance(res_json[0], list):
                # Extrai score retornado pela API externa
                for item in res_json[0]:
                    if item.get("label") in ["Fake", "LABEL_1", "AI"]:
                        return {"sucesso": True, "score_externo": round(item.get("score", 0) * 100, 2), "origem": "HuggingFace API Externa"}
    except Exception as e:
        print(f"API Externa indisponível/timeout: {e}")
    
    return {"sucesso": False, "origem": "Processador PLN Local"}

def calcular_metricas_pln(texto: str):
    paragrafos_raw = [p.strip() for p in texto.split("\n") if p.strip()]
    if not paragrafos_raw:
        return 0, 0.0, 0.0, []

    palavras_todas = re.findall(r'\b\w+\b', texto.lower())
    total_palavras = len(palavras_todas)
    if total_palavras == 0:
        return 0, 0.0, 0.0, []

    # 1. Perplexidade Aprox. (Entropia de Shannon)
    freq = {}
    for p in palavras_todas:
        freq[p] = freq.get(p, 0) + 1
    
    entropia = sum(-(count / total_palavras) * math.log2(count / total_palavras) for count in freq.values())
    perplexidade = round(2 ** entropia, 2)

    # 2. Burstiness
    frases = [f.strip() for f in re.split(r'[.!?]+', texto) if f.strip()]
    if len(frases) > 1:
        lens = [len(re.findall(r'\b\w+\b', f)) for f in frases]
        media = sum(lens) / len(lens)
        var = sum((x - media) ** 2 for x in lens) / len(lens)
        desvio = math.sqrt(var)
        burstiness = round((desvio - media) / (desvio + media + 1e-5), 2)
    else:
        burstiness = 0.0

    padrao_conectores_ia = r'\b(além disso|ademais|em suma|por conseguinte|portanto|em conclusão|é importante destacar|vale ressaltar|em primeiro lugar|por um lado|por outro lado|desempenha um papel|no contexto atual|em síntese|cabe destacar)\b'
    padrao_primeira_pessoa = r'\b(eu|me|mim|comigo|meu|minha|meus|minhas|fiz|fiquei|pedi|resolvi|fui|achei|notei|pensei|estava|viajei|saí|estou|tenho|gosto)\b'

    paragrafos_resultado = []
    scores_paragrafos = []

    for p_text in paragrafos_raw:
        p_words = re.findall(r'\b\w+\b', p_text.lower())
        p_total_words = len(p_words)
        if p_total_words == 0:
            continue

        p_frases = [f for f in re.split(r'[.!?]+', p_text) if f.strip()]
        p_num_frases = max(1, len(p_frases))

        p_conectores = len(re.findall(padrao_conectores_ia, p_text.lower()))
        p_1a_pessoa = len(re.findall(padrao_primeira_pessoa, p_text.lower()))
        p_exclamacoes = len(re.findall(r'[!?]', p_text))

        score_conectores = (p_conectores * 30.0) / max(1, p_num_frases * 0.7)
        score_perplexidade = max(0.0, (50.0 - min(perplexidade, 50.0)) * 0.3) if p_total_words > 20 else 0.0
        score_burstiness = max(0.0, (-burstiness) * 15.0) if (burstiness < 0 and len(p_frases) > 1) else 0.0
        score_humano = (p_1a_pessoa * 15.0) + (p_exclamacoes * 12.0)

        score_base = 12.0 + score_conectores + score_perplexidade + score_burstiness - score_humano

        if p_conectores == 0:
            score_base = min(24.0, score_base)

        score_p = max(5, min(96, round(score_base)))
        scores_paragrafos.append(score_p)
        paragrafos_resultado.append({
            "texto": p_text,
            "score": score_p
        })

    percentual_global = int(sum(scores_paragrafos) / len(scores_paragrafos)) if scores_paragrafos else 0
    return percentual_global, perplexidade, burstiness, paragrafos_resultado

# --- ENDPOINTS ---
@app.post("/api/auth/cadastrar")
def cadastrar(usuario: UsuarioCadastro, request: Request):
    if not usuario.aceite_lgpd:
        raise HTTPException(status_code=400, detail="É necessário aceitar os termos da LGPD.")
    
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão com o banco de dados.")

    try:
        with conn.cursor(dictionary=True) as cursor:
            cursor.execute("SELECT id FROM usuarios WHERE email = %s", (usuario.email,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

            senha_hash = hash_password(usuario.senha[:72])
            query = "INSERT INTO usuarios (nome, email, senha_hash, perfil, aceite_lgpd) VALUES (%s, %s, %s, 'user', %s)"
            cursor.execute(query, (usuario.nome, usuario.email, senha_hash, usuario.aceite_lgpd))
            conn.commit()

        registrar_log(usuario.email, "CADASTRO", "SUCESSO", request)
        return {"message": "Usuário cadastrado com sucesso!"}
    except HTTPException:
        raise
    except Exception as e:
        registrar_log(usuario.email, "CADASTRO", "FALHA", request)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(usuario: UsuarioLogin, request: Request):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão com o banco de dados.")

    try:
        with conn.cursor(dictionary=True) as cursor:
            cursor.execute("SELECT * FROM usuarios WHERE email = %s", (usuario.email,))
            user_db = cursor.fetchone()

        if not user_db or not verify_password(usuario.senha[:72], user_db["senha_hash"]):
            registrar_log(usuario.email, "LOGIN", "FALHA", request)
            raise HTTPException(status_code=401, detail="Credenciais inválidas.")

        token = create_access_token({"sub": user_db["email"], "id": user_db["id"], "perfil": user_db["perfil"]})
        registrar_log(user_db["email"], "LOGIN", "SUCESSO", request)

        return {
            "token": token,
            "id": user_db["id"],
            "nome": user_db["nome"],
            "email": user_db["email"],
            "perfil": user_db["perfil"]
        }
    finally:
        conn.close()

@app.post("/api/analisar")
def analisar_texto(payload: TextoAnalise, request: Request, current_user: Optional[dict] = Depends(get_current_user)):
    texto = payload.texto.strip()
    if not texto:
        raise HTTPException(status_code=400, detail="O texto não pode estar vazio.")

    # Executa verificação na API Externa de PLN
    dados_api_externa = consultar_api_externa_pln(texto)

    percentual_ia, perplexidade, burstiness, paragrafos = calcular_metricas_pln(texto)
    
    # Se a API externa respondeu com sucesso, ajusta proporcionalmente o score
    if dados_api_externa.get("sucesso"):
        percentual_ia = int((percentual_ia + dados_api_externa.get("score_externo")) / 2)

    user_email = current_user.get("sub") if current_user else "visitante@detector.ia"
    user_id = current_user.get("id") if current_user else None

    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                query = """INSERT INTO historico_analises 
                           (usuario_id, texto_analisado, percentual_ia, perplexidade, burstiness, data_analise) 
                           VALUES (%s, %s, %s, %s, %s, %s)"""
                cursor.execute(query, (user_id, texto[:250], percentual_ia, perplexidade, burstiness, datetime.datetime.now()))
                conn.commit()
        except Exception as e:
            print(f"Erro ao salvar histórico: {e}")
        finally:
            conn.close()

    registrar_log(user_email, "ANALISE_TEXTO", "SUCESSO", request)

    return {
        "percentual_ia": percentual_ia,
        "perplexidade": perplexidade,
        "burstiness": burstiness,
        "paragrafos": paragrafos,
        "api_externa": dados_api_externa
    }

@app.get("/api/historico")
def obter_historico(current_user: Optional[dict] = Depends(get_current_user)):
    conn = get_db_connection()
    if not conn:
        return []

    try:
        with conn.cursor(dictionary=True) as cursor:
            if current_user and current_user.get("perfil") != "admin":
                cursor.execute("SELECT * FROM historico_analises WHERE usuario_id = %s ORDER BY id DESC LIMIT 10", (current_user.get("id"),))
            else:
                cursor.execute("SELECT * FROM historico_analises ORDER BY id DESC LIMIT 10")
            
            return cursor.fetchall()
    except Exception:
        return []
    finally:
        conn.close()

@app.delete("/api/historico")
def limpar_historico(request: Request, current_user: Optional[dict] = Depends(get_current_user)):
    conn = get_db_connection()
    if not conn:
        return {"message": "Sem conexão com o banco."}

    user_email = current_user.get("sub") if current_user else "visitante@detector.ia"
    try:
        with conn.cursor() as cursor:
            if current_user and current_user.get("perfil") != "admin":
                cursor.execute("DELETE FROM historico_analises WHERE usuario_id = %s", (current_user.get("id"),))
            else:
                cursor.execute("DELETE FROM historico_analises")
            conn.commit()
            registrar_log(user_email, "LIMPAR_HISTORICO", "SUCESSO", request)
            return {"message": "Histórico limpo com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/logs")
def obter_logs(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user or current_user.get("perfil") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao Administrador.")

    conn = get_db_connection()
    if not conn:
        return []

    try:
        with conn.cursor(dictionary=True) as cursor:
            cursor.execute("SELECT * FROM logs ORDER BY id DESC LIMIT 20")
            logs = cursor.fetchall()

        for log in logs:
            if isinstance(log.get("data_hora"), datetime.datetime):
                log["data_hora"] = log["data_hora"].strftime("%Y-%m-%d %H:%M:%S")

        return logs
    except Exception:
        return []
    finally:
        conn.close()