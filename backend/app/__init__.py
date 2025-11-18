from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .services import run_analysis

class QueryPayload(BaseModel):
    query: str

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze")
def analyze(payload: QueryPayload):
    result = run_analysis(payload.query)
    return {
        "geojson": result["geojson"],
        "summary": result["summary"],
        "tokens": result["tokens"],
        "error": result["error"]
    }
