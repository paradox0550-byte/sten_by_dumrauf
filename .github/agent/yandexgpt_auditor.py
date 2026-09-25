#!/usr/bin/env python3
import json, os, subprocess, urllib.request, urllib.error
from pathlib import Path

BASE_URL = os.environ.get("YANDEXGPT_BASE_URL", "https://ai.api.cloud.yandex.net/v1").rstrip("/")
API_KEY = os.environ["YANDEXGPT_API_KEY"]
FOLDER_ID = os.environ["YANDEXGPT_FOLDER_ID"]
MODEL = os.environ.get("YANDEXGPT_MODEL_NAME") or f"gpt://{FOLDER_ID}/yandexgpt/latest"
SKILL = os.environ.get("SKILL", "full")

def tracked_files():
    raw = subprocess.check_output(["git", "ls-files"], text=True)
    return [x.strip() for x in raw.splitlines() if x.strip()]

def collect():
    allow = (
        "src/", "public/", ".github/agent/AGENT.md", ".github/agent/PROJECT_MEMORY.md", ".github/agent/skills/",
        "openapi.yaml", "package.json", "tsconfig.json", "vite.config.ts", "README.md"
    )
    skip = ("node_modules/", "dist/", ".git/")
    chunks, total = [], 0
    for path in tracked_files():
        if not (path.startswith(allow) or path in allow):
            continue
        if path.startswith(skip):
            continue
        p = Path(path)
        if not p.is_file():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > 12000:
            text = text[:12000] + "\n...[TRUNCATED]..."
        block = f"\n===== {path} =====\n{text}\n"
        if total + len(block) > 65000:
            break
        chunks.append(block)
        total += len(block)
    return "".join(chunks)

tasks = {
    "full": "Проведи полный senior-аудит frontend: архитектура, React runtime, TypeScript, routes, API/data-flow, финансовая логика, UX и production-регрессии.",
    "audit": "Проведи технический аудит frontend, API contracts, runtime и потенциальных 404/500.",
    "operations": "Проверь операционный контур сотрудников, должностей, графиков, смен, табеля и ФОТ.",
    "finance": "Проверь P&L, P&L Import, Excel mapping, сохранение статей, бюджет, план/факт, Food Cost, ФОТ, OPEX, EBITDA и прибыль.",
    "optimization": "Проверь управленческие расчёты, staffing, labor productivity, unit economics и воспроизводимость показателей.",
    "css": "Проведи responsive/mobile/browser UX аудит и найди реальные CSS/interaction-регрессии.",
    "routes": "Проверь все frontend routes, API routes, lazy imports, API contracts и 404/redirect риски."
}
system = """Ты senior software architect и QA-аудитор проекта Смена в кармане / STEN.
Работай только с представленным кодом. Не придумывай отсутствующий backend или данные. Применяй релевантные playbooks из .github/agent/skills/ и в отчёте перечисляй применённые skills.
Главное правило продукта: реальные данные, отсутствие данных не превращать в ноль.
AI production-контур продукта: YandexGPT через Yandex Cloud AI Studio; браузер не вызывает AI напрямую.
Новые функции должны иметь полный путь UI → API → backend → данные → ответ → UI.
Верни конкретные дефекты с файлом и строкой/символом, причиной, риском и точным исправлением.
Отдельно перечисли проверки, которые нельзя подтвердить без Yandex Cloud backend.
Не давай пустых общих советов."""
user = tasks.get(SKILL, tasks["full"]) + "\n\nКод проекта:\n" + collect()

payload = {
    "modelUri": MODEL,
    "completionOptions": {"stream": False, "temperature": 0.1, "maxTokens": "5000"},
    "messages": [{"role": "system", "text": system}, {"role": "user", "text": user}]
}
url = BASE_URL + "/foundationModels/v1/completion"
req = urllib.request.Request(
    url, data=json.dumps(payload).encode("utf-8"),
    headers={"Authorization": f"Api-Key {API_KEY}", "Content-Type": "application/json"},
    method="POST"
)
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.load(resp)
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", "replace")
    raise SystemExit(f"YandexGPT HTTP {e.code}: {body[:2000]}")

text = data.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
if not text:
    raise SystemExit("YandexGPT returned no audit text")

Path(".github/agent/AUDIT_REPORT.md").write_text(
    "# STEN — YandexGPT engineering audit\n\n" +
    f"Skill: {SKILL}\nModel: {MODEL}\n\n" + text + "\n",
    encoding="utf-8"
)
print("Audit report written to .github/agent/AUDIT_REPORT.md")
