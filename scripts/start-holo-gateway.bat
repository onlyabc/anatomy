@echo off
setlocal
set HOLO_REMOTE=http://121.199.173.176:3010
set HOLO_GATEWAY_PORT=3010
echo Holo local gateway -> %HOLO_REMOTE%
echo Open http://127.0.0.1:%HOLO_GATEWAY_PORT% in your browser
node "%~dp0holo-local-gateway.mjs"
pause
