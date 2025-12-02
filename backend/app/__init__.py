from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .modes.services import run_analysis

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
        "geojson_b": result["geojson_b"],
        "geojson_s": result["geojson_s"],
        "geojson_s_boro": result["geojson_s_boro"],
        "summary_b": result["summary_b"],
        "summary_s": result["summary_s"],
        "summary_s_boro": result["summary_s"],
        "explanation_b": result["explanation_b"],
        "explanation_s": result["explanation_s"],
        "explanation_s_boro": result["explanation_s"],
        "tokens": result["tokens"],
        "error": result["error"]
    }
