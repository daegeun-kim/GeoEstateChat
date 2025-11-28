import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env")
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

DB_SCHEMA = """
db: PostgreSQL 16 + PostGIS

tables:
    buildings:
        spine: [borocode, large_n, small_n, shape_area, shape_leng, geom]
        cat: [zoning, bldg_class]
        bool: [elevator]
        num:
            built_year
            ground_ele : ground elevation (ft)
            heightroof
            bld_value_2025 : total building value (2025)
            bld_value_2024
            avg_prop_value_2025   : avg property value inside building (2025)
            avg_prop_value_2024
            value_sqft_2025
            value_sqft_2024
            gross_sqft
            res_gross_sqft
            bld_story

    street_block:
        spine: [borocode, large_n, small_n, geom]
        cat: [ur20, zoning, bldg_class_dom]
        num:
            aland20 : land area
            awater20 : water area
            housing20 : total housing units
            pop20 : population
            built_year_avg
            ground_ele_avg
            height_avg            : avg building height (ft)
            ele_percent           : percent of buildings with elevator
            bld_val_2025_sum
            bld_val_2024_sum
            gross_sqft_sum
            res_gross_sqft_sum
            prop_val_2025_avg
            prop_val_2024_avg
            story_avg             : avg building stories
            val_sqft_2025_avg
            val_sqft_2024_avg

    regions:
    borocode: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island
    large_n_by_borocode:
        1: [way uptown manhattan, midtown manhattan, downtown manhattan, uptown manhattan]
        2: [central bronx, west bronx, east bronx, south bronx]
        3: [south brooklyn, north brooklyn, central brooklyn, east brooklyn]
        4: [northeast queens, western queens, southeast queens,
            rockaways queens, northwest queens, special queens, central queens]
        5: [south shore staten island, east shore staten island,
            mid staten island, north shore staten island]
    """


OUTPUT_FIELDS = ["column_b", "column_s", "neighborhood"]

def make_user_input(query: str) -> list:
    return [
        {
            "role": "system",
            "content": (
                "You translate natural-language questions into fields for the PostgreSQL table 'buildings' & 'street_block'. "
                "Return a single-line JSON object with keys:\n"
                "  - column_b: most relevant column name in 'buildings'\n"
                "  - column_s: corresponding most relevant column name in 'street_block'\n"
                "  - neighborhood: most relevant neighborhood from 'large_n'\n"
                "If any item cannot be matched, set it to NO_MATCH.\n"
                "Output format example:\n"
                '{"column_b": "heightroof", "column_s": "height_avg", "neighborhood": "midtown manhattan"}\n'
                "Do not include code fences or any extra text."
            )
        },
        {
            "role": "user",
            "content": f"Schema:\n{DB_SCHEMA}\n\nQuery: '{query}'"
				}
    ]
    
def get_column_from_query(query: str):
    resp = client.responses.create(
        model="gpt-5-nano",
        input=make_user_input(query),
    )

    raw = resp.output_text.strip()
    print("RAW:", repr(raw))

    try:
        parsed = json.loads(raw)
    except Exception as e:
        print("format error:", e)
        return {
            "column_b": None,
            "column_s": None,
            "neighborhood": None,
            "usage": None,
            "error": "LLM_OUTPUT_FORMAT_ERROR",
        }

    result = {}
    for key in OUTPUT_FIELDS:
        val = parsed.get(key, "NO_MATCH")
        result[key] = None if val == "NO_MATCH" else val

    usage = resp.usage
    print(
        f"column_b: {result['column_b']}, neighborhood: {result['neighborhood']}, "
        f"column_s: {result['column_s']}"
        f"tokens: {usage.total_tokens}"
    )

    return {
        "column_b": result["column_b"],
        "column_s": result["column_s"],
        "neighborhood": result["neighborhood"],
        "usage": {
            "total": usage.total_tokens,
            "input": usage.input_tokens,
            "output": usage.output_tokens,
        },
        "error": None,
    }