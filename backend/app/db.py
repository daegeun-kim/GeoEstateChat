import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import geopandas as gpd

load_dotenv(dotenv_path="../.env")

DB_URL = os.getenv("db_url")
engine = create_engine(DB_URL)

def get_data(column):
    if column == "there is no appropriate data for your query":
        print("no column found")
        return {
            "gdf": None,
            "error": column
        }

    try:
        sql = f"SELECT {column}, geom FROM buildings WHERE borocode = 1"
        gdf = gpd.read_postgis(sql, con=engine, geom_col="geom")
        print("data retrieved from db")
        return {
            "gdf": gdf,
            "error": None
        }
    except Exception:
        print("failed to retrieve data")
        return {
            "gdf": None,
            "error": "failed to retrieve data"
        }
    