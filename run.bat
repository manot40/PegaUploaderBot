@ECHO OFF

:START
CLS
ECHO 1. Mulai Bot
ECHO 2. Batch Rename
ECHO 3. Keluar
SET /P INPUT="Masukan angka pilihan (1-3): "

2>NUL CALL :CASE_%INPUT% 
IF ERRORLEVEL 1 CALL :CASE_4

:CASE_1
  node dist
  PAUSE
  GOTO START
:CASE_2
  node renbatch.js
  PAUSE
  GOTO START
:CASE_3
  ECHO Bye.
  EXIT