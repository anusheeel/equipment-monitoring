@echo off
title GIP Equipment Monitoring
echo Starting GIP Equipment Monitoring Server...
echo.
set "GIP_ROOT=%~dp0."
powershell -NoProfile -Command "& ([scriptblock]::Create([IO.File]::ReadAllText((Join-Path $env:GIP_ROOT 'server.ps1'))))"
pause
