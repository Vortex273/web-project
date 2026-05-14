from pathlib import Path

js_path = Path("server.js")
json_path = Path("public/routes.json")

text = js_path.read_text(encoding="utf-8")

# вырезаем только объект
start = text.index("{")
end = text.rindex("}") + 1

data = text[start:end]

# исправления
data = data.replace("'", '"')

# ключи без кавычек
import re

data = re.sub(r'([,{]\\s*)([a-zA-Z0-9_]+)\\s*:', r'\\1"\\2":', data)

json_path.write_text(data, encoding="utf-8")

print("routes.json создан")