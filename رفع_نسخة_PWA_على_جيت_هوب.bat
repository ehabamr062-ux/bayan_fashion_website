@echo off
title Bayan POS - PWA GitHub Uploader
cd /d "%~dp0"
cls

echo ======================================================
echo    Bayan POS Fashion - PWA Uploader to GitHub
echo    Target: https://github.com/ehabamr062-ux/bayan_fashion_website
echo ======================================================
echo.

echo [1/3] Setting git branch and remote...
git branch -M main
git remote set-url origin https://github.com/ehabamr062-ux/bayan_fashion_website.git 2>nul || git remote add origin https://github.com/ehabamr062-ux/bayan_fashion_website.git

echo.
echo [2/3] Adding all files and creating commit...
git add -A
git commit -m "Update PWA release and optimizations"

echo.
echo [3/3] Uploading files to GitHub...
git push -u origin main --force

echo.
echo ======================================================
echo    UPLOAD COMPLETE!
echo    Your live PWA is updated at:
echo    https://ehabamr062-ux.github.io/bayan_fashion_website/
echo ======================================================
echo.
pause
