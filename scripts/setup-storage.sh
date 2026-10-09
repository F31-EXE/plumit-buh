#!/usr/bin/env bash
# Настраивает хранилище файлов (документы сотрудников). Запускать один раз в Google Cloud Shell
# ПОСЛЕ того, как включён тариф Blaze и в консоли Firebase нажато Storage → «Начать».
# Повторный запуск безопасен.
set -euo pipefail

PROJECT_ID="plumit-buh"
BUCKET="plumit-buh.firebasestorage.app"
DEPLOY_SA="github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
step() { echo; echo "▶ $*"; }

step "Ищу хранилище проекта"
BUCKETS="$(gcloud storage buckets list --project="$PROJECT_ID" --format='value(name)' 2>/dev/null || true)"
if ! echo "$BUCKETS" | grep -qx "$BUCKET"; then
  # У части проектов хранилище по умолчанию называется <проект>.appspot.com
  if echo "$BUCKETS" | grep -qx "${PROJECT_ID}.appspot.com"; then
    BUCKET="${PROJECT_ID}.appspot.com"
    echo "⚠ Хранилище называется gs://${BUCKET} — сообщите это разработчику: в приложении нужно поменять VITE_FIREBASE_STORAGE_BUCKET."
  else
    echo "✖ Хранилище не найдено. Сейчас в проекте: ${BUCKETS:-(нет ни одного)}"
    echo
    echo "  1) Проверьте тариф: https://console.firebase.google.com/project/${PROJECT_ID}/usage/details — должно быть «Blaze»."
    echo "  2) Откройте https://console.firebase.google.com/project/${PROJECT_ID}/storage → «Get started» / «Начать»,"
    echo "     выберите «Production mode» и регион в Европе → «Done». Дождитесь, пока откроется вкладка «Files»."
    echo "  3) Запустите этот скрипт снова."
    exit 1
  fi
fi
echo "✔ gs://${BUCKET}"

step "Разрешаю правилам хранилища читать таблицу доступа (access) из Firestore"
gcloud services enable firebasestorage.googleapis.com firebaserules.googleapis.com >/dev/null
gcloud beta services identity create --service=firebasestorage.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role="roles/firebaserules.firestoreServiceAgent" --condition=None --quiet >/dev/null

step "Даю аккаунту автовыкладки права на правила хранилища"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/firebasestorage.admin" --condition=None --quiet >/dev/null

step "Настраиваю CORS — чтобы приложение могло открывать файлы внутри себя"
CORS="$(mktemp)"
cat > "$CORS" <<'JSON'
[{
  "origin": ["https://plumit-buh.web.app", "https://plumit-buh.firebaseapp.com", "http://localhost:5173"],
  "method": ["GET"],
  "responseHeader": ["Content-Type", "Authorization"],
  "maxAgeSeconds": 3600
}]
JSON
gcloud storage buckets update "gs://${BUCKET}" --cors-file="$CORS" >/dev/null
rm -f "$CORS"

echo
echo "✅ Хранилище настроено."
echo "   Теперь перезапустите выкладку: https://github.com/F31-EXE/plumit-buh/actions → «Тесты и выкладка» → Run workflow"
echo "   (если подключите свой домен — добавьте его в origin выше и запустите скрипт снова)"
