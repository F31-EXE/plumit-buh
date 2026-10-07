#!/usr/bin/env bash
# Настраивает выкладку из GitHub Actions в Firebase без ключей (Workload Identity Federation).
# Запускать один раз в Google Cloud Shell: https://shell.cloud.google.com
# Скрипт можно запускать повторно — уже созданное он пропускает.
set -euo pipefail

PROJECT_ID="plumit-buh"
REPO="F31-EXE/plumit-buh"        # только этот репозиторий сможет выкладывать
SA_NAME="github-deploy"
POOL="github"
PROVIDER="github"

SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

step() { echo; echo "▶ $*"; }
exists() { "$@" >/dev/null 2>&1; }

step "Включаю нужные API"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com

step "Сервисный аккаунт ${SA}"
exists gcloud iam service-accounts describe "$SA" \
  || gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub Actions deploy"

step "Права аккаунта: Firebase Admin + Service Usage Consumer"
for ROLE in roles/firebase.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA}" \
    --role="$ROLE" --condition=None --quiet >/dev/null
done

step "Пул удостоверений для GitHub"
exists gcloud iam workload-identity-pools describe "$POOL" --location=global \
  || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"

step "Провайдер OIDC (доверяем только репозиторию ${REPO})"
exists gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
       --location=global --workload-identity-pool="$POOL" --display-name="GitHub" \
       --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
       --attribute-condition="assertion.repository == '${REPO}'"

step "Разрешаю репозиторию действовать от имени аккаунта"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --quiet >/dev/null

echo
echo "✅ Готово. Номер проекта: ${PROJECT_NUMBER}"
echo "   Провайдер: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "   Теперь откройте https://github.com/${REPO}/actions и перезапустите «Тесты и выкладка»."
