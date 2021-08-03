@echo off

IF "%1" == "start" (
	GOTO STARTBOT
)else IF "%1" == "compress" (
	GOTO COMPRESS
)else IF "%1" == "mango" (
	GOTO MANGO
)

:INQUIRE
echo Run compress tools? (y/[n])
SET QUESTION=
SET /P QUESTION=Type input: %=%
IF /I "%QUESTION%"=="y" (
	GOTO COMPRESS
)else IF /I "%QUESTION%" NEQ "y" (
	GOTO STARTBOT
)

:COMPRESS
node compress.js
echo Run uploader bot? (y/[n])
SET QUESTION=
SET /P QUESTION=Type input: %=%
IF /I "%QUESTION%"=="y" (
	GOTO STARTBOT
)else IF /I "%QUESTION%" NEQ "y" (
	GOTO END
)

:MANGO
node mango.js
GOTO END

:STARTBOT
clear
cls
node bot.js

:END
echo.
echo all task done.
pause