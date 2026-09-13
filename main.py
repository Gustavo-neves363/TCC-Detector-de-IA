from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",
        database="detector_ia"
    )

class AnalisePayload(BaseModel):
    texto: str
    percentual_ia: float

@app.post("/api/analisar")
def salvar_analise(dados: AnalisePayload):
    db = get_db()
    cursor = db.cursor()
    sql = "INSERT INTO historico_analises (texto_analisado, percentual_ia) VALUES (%s, %s)"
    cursor.execute(sql, (dados.texto, dados.percentual_ia))
    db.commit()
    cursor.close()
    db.close()
    return {"status": "sucesso"}

@app.get("/api/historico")
def obter_historico():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT id, texto_analisado, percentual_ia, data_criacao FROM historico_analises ORDER BY id DESC LIMIT 10")
    historico = cursor.fetchall()
    cursor.close()
    db.close()
    return historico

@app.delete("/api/historico")
def limpar_historico():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("TRUNCATE TABLE historico_analises")
    db.commit()
    cursor.close()
    db.close()
    return {"status": "historico_limpo"}
    