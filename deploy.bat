@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
color 0E
title Djeliya - Deploiement

echo ============================================
echo   DJELIYA - Deploiement automatique
echo ============================================
echo.

REM Se placer dans le dossier ou se trouve ce script, quel que soit l'endroit d'ou il est lance
cd /d "%~dp0"

echo Dossier courant : %cd%
echo.

REM Verifier qu'on est bien dans un depot git
if not exist ".git" (
    echo [ERREUR] Ce dossier n'est pas un depot Git.
    echo Assure-toi que deploy.bat est bien place dans C:\Projets\djeliya
    echo.
    pause
    exit /b 1
)

echo --- Etat actuel du projet ---
git status --short
echo.

REM Verifier s'il y a des changements a envoyer
git diff --quiet --exit-code
set HAS_UNSTAGED=%errorlevel%
git diff --cached --quiet --exit-code
set HAS_STAGED=%errorlevel%

for /f %%i in ('git status --porcelain ^| find /c /v ""') do set NB_CHANGEMENTS=%%i

if "%NB_CHANGEMENTS%"=="0" (
    echo Aucun changement detecte. Rien a deployer.
    echo.
    pause
    exit /b 0
)

echo %NB_CHANGEMENTS% fichier(s) modifie(s) detecte(s).
echo.

set /p MESSAGE="Message de commit (Entree = 'Mise a jour'): "
if "%MESSAGE%"=="" set MESSAGE=Mise a jour

echo.
echo --- Ajout des fichiers ---
git add -A
if errorlevel 1 (
    echo [ERREUR] Echec de 'git add'.
    pause
    exit /b 1
)

echo.
echo --- Creation du commit ---
git commit -m "%MESSAGE%"
if errorlevel 1 (
    echo [ERREUR] Echec du commit. Verifie les messages ci-dessus.
    pause
    exit /b 1
)

echo.
echo --- Envoi vers GitHub ---
git push
if errorlevel 1 (
    echo [ERREUR] Echec du push. Verifie ta connexion internet ou tes identifiants GitHub.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Deploiement envoye avec succes !
echo ============================================
echo.
echo - GitHub Actions va compiler l'APK et l'AAB automatiquement.
echo - Railway va redeployer le serveur automatiquement.
echo.
echo Verifie l'avancement sur :
echo   https://github.com/dossochoilio-coder/djeliya/actions
echo   https://railway.com
echo.
pause
