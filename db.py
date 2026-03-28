import psycopg2

def get_connection():
    conn = psycopg2.connect(
        host="localhost",        # 🔥 สำคัญ
        database="postgres",
        user="admin",
        password="admin",
        port=5432
    )
    return conn
