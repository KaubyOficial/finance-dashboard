@echo off
REM Finance Dashboard — sobe backend (5275) + front (5273) num comando.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
if not exist .env (
  echo Copiando .env.example para .env ^(preencha as credenciais depois^)...
  copy .env.example .env >nul
)
call npm run migrate
start "" http://localhost:5273
call npm run dev
