@ECHO OFF

:START
CLS
ECHO 1. Mulai Bot
ECHO 2. Kompres Foto
ECHO 3. Batch Rename
ECHO 4. Keluar
SET /P INPUT="Masukan angka pilihan (1-4): "

2>NUL CALL :CASE_%INPUT% 
IF ERRORLEVEL 1 CALL :CASE_4

:CASE_1
  node bot.js
  PAUSE
  GOTO START
:CASE_2
  node compress.js
  PAUSE
  GOTO START
:CASE_3
  node renbatch.js
  PAUSE
  GOTO START
:CASE_4
  ECHO Bye.
  EXIT