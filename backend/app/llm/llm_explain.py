import json
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv("../.env")
api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=api_key)


def llm_explain(query: str, column: str, neighborhood: str | None, summary: dict) -> str:
    summary_json = json.dumps(summary, ensure_ascii=False)

    system_msg = (
        "You are an urban data analyst. "
        "You receive a user question and computed analysis results as JSON. "
        "You must produce a concise, structured explanation in English with clear line breaks. "
        "Follow exactly this structure:\n\n"
        "Analysis Summary:\n"
        "used data: {column name}\n"
        "neighborhood: {neighborhood name or 'all areas'}\n\n"
        "statistical summary:\n"
        "- count: ...\n"
        "- mean: ...\n"
        "- median: ...\n"
        "- min: ...\n"
        "- max: ...\n"
        "interpretation:\n"
        "3-5 short sentences describing skewness, spread, and how to read these numbers. "
        "Round every numeric value to three decimal places. "
        "Base everything strictly on the provided JSON; do not invent numbers or extra fields."
    )

    user_msg = (
        f"User question: {query}\n\n"
        f"Selected column: {column}\n"
        f"Neighborhood filter: {neighborhood}\n\n"
        f"Result data (JSON):\n{summary_json}"
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-5-nano",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
        )

        content = resp.choices[0].message.content
        if not content:
            return "[No explanation generated]"
        return content.strip()

    except Exception as e:
        return f"[llm_explain error: {e}]"
