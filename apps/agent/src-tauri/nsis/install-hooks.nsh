; =============================================================================
; Configuration Variables - Customize these for your application
; =============================================================================
!define APP_NAME "MSPAgent"
!define APP_COMPANY "MSPByte"
!define CONFIG_DIR_NAME "MSPAgent"  ; Folder name in ProgramData
!define APP_VERSION "0.1.20"
!define API_HOST "https://agent.mspbyte.pro"

; =============================================================================
; Tauri NSIS Hook - Pre-Install
; This runs before Tauri's main installation logic
; =============================================================================

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "StrFunc.nsh"

; Insert function declarations
!insertmacro GetTime
!insertmacro GetParameters
!insertmacro GetOptions
${StrRep}
${StrStr}

; Global variables
Var SiteSecret
Var ShowAgent
Var ApiHost
Var InstallTimestamp
Var LogFile

; PowerShell-based logging function - simple and reliable
Function LogWrite
    ; Input: $R9 = message to log
    Push $R8
    Push $R7

    ; Create a temporary PowerShell script file
    StrCpy $R7 "$TEMP\nsis_log_$$.ps1"
    FileOpen $R8 $R7 w
    FileWrite $R8 '$$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"$\r$\n'
    FileWrite $R8 '$$logPath = "$LogFile"$\r$\n'
    FileWrite $R8 '$$message = "[$timestamp] $R9"$\r$\n'
    FileWrite $R8 'Add-Content -Path $$logPath -Value $$message -Encoding UTF8 -Force$\r$\n'
    FileWrite $R8 'Write-Host "LOGGED: $$message"$\r$\n'
    FileClose $R8

    ; Execute the PowerShell script
    nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R7"'
    Pop $R8  ; Exit code
    Pop $R8  ; Output

    ; Clean up the temporary script
    Delete $R7

    Pop $R7
    Pop $R8
FunctionEnd

; Uninstaller version of LogWrite function
Function un.LogWrite
    ; Input: $R9 = message to log
    Push $R8
    Push $R7

    ; Create a temporary PowerShell script file
    StrCpy $R7 "$TEMP\nsis_log_$$.ps1"
    FileOpen $R8 $R7 w
    FileWrite $R8 '$$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"$\r$\n'
    FileWrite $R8 '$$logPath = "$LogFile"$\r$\n'
    FileWrite $R8 '$$message = "[$timestamp] $R9"$\r$\n'
    FileWrite $R8 'Add-Content -Path $$logPath -Value $$message -Encoding UTF8 -Force$\r$\n'
    FileWrite $R8 'Write-Host "LOGGED: $$message"$\r$\n'
    FileClose $R8

    ; Execute the PowerShell script
    nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R7"'
    Pop $R8  ; Exit code
    Pop $R8  ; Output

    ; Clean up the temporary script
    Delete $R7

    Pop $R7
    Pop $R8
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
    ; Initialize log file with unique timestamp in ProgramData
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6

    ; Create logs directory first
    CreateDirectory "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    CreateDirectory "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs"

    StrCpy $LogFile "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs\install_${APP_VERSION}.log"

    ; Log startup information (LogWrite will create the file)
    StrCpy $R9 "=== MSPAgent Installation Log ==="
    Call LogWrite
    StrCpy $R9 "Started: $2-$1-$0 $4:$5:$6"
    Call LogWrite
    StrCpy $R9 "Log file: $LogFile"
    Call LogWrite
    StrCpy $R9 "Install mode: perMachine"
    Call LogWrite

    ; Set local vars
    StrCpy $ApiHost "${API_HOST}"
    StrCpy $R9 "API Host set to: $ApiHost"
    Call LogWrite

    StrCpy $R9 "=== STEP 1: Checking Admin Privileges ==="
    Call LogWrite

    ; Check for admin privileges
    Call CheckAdminPrivileges

    StrCpy $R9 "=== STEP 2: Parsing Install Parameters ==="
    Call LogWrite

    ; Parse and validate parameters
    Call ParseInstallParameters

    StrCpy $R9 "=== STEP 3: Setting up ProgramData Directory ==="
    Call LogWrite

    ; Setup ProgramData directory
    Call SetupProgramDataDirectory

    StrCpy $R9 "=== STEP 4: Creating Site Configuration ==="
    Call LogWrite

    ; Create site configuration
    Call CreateSiteConfig

    ; Log completion
    StrCpy $R9 "Pre-install hook completed successfully"
    Call LogWrite
!macroend

!macro NSIS_HOOK_POSTINSTALL
    StrCpy $R9 "=== POST-INSTALL: Installation completed ==="
    Call LogWrite

    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}" '"$INSTDIR\${APP_NAME}.exe"'
    StrCpy $R9 "Added autostart registry key to HKLM\Run"
    Call LogWrite

    ; Delete desktop shortcuts
    StrCpy $R9 "Removing desktop shortcuts"
    Call LogWrite
    Delete "$DESKTOP\${APP_NAME}.lnk"
    Delete "$COMMONDESKTOP\${APP_NAME}.lnk"
    StrCpy $R9 "Desktop shortcuts removed"
    Call LogWrite
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ; Initialize uninstall log file with unique timestamp in ProgramData
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6

    ; Ensure logs directory exists (it should from install, but just in case)
    CreateDirectory "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    CreateDirectory "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs"

    StrCpy $LogFile "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs\uninstall_${APP_VERSION}.log"

    ; Log startup information (LogWrite will create the file)
    StrCpy $R9 "=== ${APP_NAME} Uninstallation Log ==="
    Call un.LogWrite
    StrCpy $R9 "Started: $2-$1-$0 $4:$5:$6"
    Call un.LogWrite
    StrCpy $R9 "Log file: $LogFile"
    Call un.LogWrite
    StrCpy $R9 "Uninstall mode: perMachine"
    Call un.LogWrite

    StrCpy $R9 "=== STEP 1: Removing Auto-Start Registry Key ==="
    Call un.LogWrite

    ; Remove auto-start registry key
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
    StrCpy $R9 "Auto-start registry key removed"
    Call un.LogWrite

    StrCpy $R9 "=== STEP 2: Checking Configuration Data ==="
    Call un.LogWrite

    ; Check if we should remove configuration data
    Call un.CheckRemoveConfigData

    ; Log completion
    StrCpy $R9 "Pre-uninstall hook completed successfully"
    Call un.LogWrite
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend

; Function: Check Admin Privileges
Function CheckAdminPrivileges
    StrCpy $R9 "Starting admin privileges check"
    Call LogWrite

    ; Try to write to a system directory to test admin privileges
    ClearErrors
    CreateDirectory "$WINDIR\temp\nsis_admin_test"
    ${If} ${Errors}
        StrCpy $R9 "System directory write test: FAILED"
        Call LogWrite

        ; Also test ProgramData access directly
        ClearErrors
        CreateDirectory "$COMMONPROGRAMDATA\nsis_test"
        ${If} ${Errors}
            StrCpy $R9 "ProgramData write test: FAILED"
            Call LogWrite
        ${Else}
            RMDir "$COMMONPROGRAMDATA\nsis_test"
            StrCpy $R9 "ProgramData write test: SUCCESS (but WINDIR failed)"
            Call LogWrite
        ${EndIf}

        ; Try UserInfo plugin
        UserInfo::GetAccountType
        Pop $0
        StrCpy $R9 "UserInfo::GetAccountType returned: '$0'"
        Call LogWrite

        ; Check for various admin account types
        ${If} $0 != "Admin"
        ${AndIf} $0 != "admin"
        ${AndIf} $0 != "Administrator"
            StrCpy $R9 "ERROR: Administrator privileges required - Account: '$0'"
            Call LogWrite

            SetErrorLevel 740
            Quit
        ${Else}
            StrCpy $R9 "UserInfo indicates admin privileges available"
            Call LogWrite
        ${EndIf}
    ${Else}
        ; Clean up test directory
        RMDir "$WINDIR\temp\nsis_admin_test"
        StrCpy $R9 "System directory write test: SUCCESS"
        Call LogWrite
    ${EndIf}

    StrCpy $R9 "Administrator privileges confirmed"
    Call LogWrite
FunctionEnd

; Function: Parse Install Parameters
Function ParseInstallParameters
    StrCpy $R9 "Parsing command line parameters"
    Call LogWrite

    ${GetParameters} $R0
    StrCpy $R9 "Raw parameters: $R0"
    Call LogWrite

    ; Parse /secret parameter
    ${GetOptions} $R0 "/secret=" $SiteSecret
    ${GetOptions} $R0 "/visible=" $ShowAgent

    ; Validate that secret was provided
    ${If} $SiteSecret == ""
        StrCpy $R9 "ERROR: Missing required /secret parameter"
        Call LogWrite

        SetErrorLevel 1
        Abort
    ${EndIf}

    ${If} $ShowAgent == ""
        StrCpy $ShowAgent "false"
    ${EndIf}

    StrCpy $R9 "Site secret parameter found"
    Call LogWrite

    ; Don't log the actual secret for security
    StrLen $R1 $SiteSecret
    StrCpy $R9 "Secret length: $R1 characters"
    Call LogWrite
    StrCpy $R9 "API host: $ApiHost"
    Call LogWrite
FunctionEnd

; Function: Setup ProgramData Directory
Function SetupProgramDataDirectory
    StrCpy $R9 "Setting up ProgramData directory"
    Call LogWrite

    ; Expand the path for logging
    StrCpy $R0 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    StrCpy $R9 "Target directory: $R0"
    Call LogWrite

    ; Create directory
    ClearErrors
    CreateDirectory "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    ${If} ${Errors}
        StrCpy $R9 "ERROR: Failed to create directory - insufficient privileges"
        Call LogWrite

        SetErrorLevel 5
        Abort
    ${EndIf}

    StrCpy $R9 "Directory created successfully"
    Call LogWrite

    ; Set permissions using icacls (built-in Windows command)
    StrCpy $R9 "Setting permissions using icacls"
    Call LogWrite

    ; Grant Users full control
    StrCpy $R0 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    StrCpy $R9 "Attempting to set Users permissions on: $R0"
    Call LogWrite

    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}" /grant Users:(OI)(CI)F /T'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "Users permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "Users permissions: FAILED (exit code: $0)"
        Call LogWrite
        ; icacls exit code 3 = access denied, 1 = general error
        ${If} $0 == 3
            StrCpy $R9 "  - Access denied (code 3) - insufficient privileges"
            Call LogWrite
        ${ElseIf} $0 == 1
            StrCpy $R9 "  - General error (code 1) - invalid path or syntax"
            Call LogWrite
        ${EndIf}
    ${EndIf}

    ; Grant Administrators full control
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}" /grant Administrators:(OI)(CI)F /T'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "Administrators permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "Administrators permissions: FAILED (exit code: $0)"
        Call LogWrite
    ${EndIf}

    ; Grant SYSTEM full control
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}" /grant SYSTEM:(OI)(CI)F /T'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "SYSTEM permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "SYSTEM permissions: FAILED (exit code: $0)"
        Call LogWrite
    ${EndIf}

    ; Set specific permissions for logs directory - make it fully writable by all users
    StrCpy $R9 "Setting permissions for logs directory"
    Call LogWrite

    ; Grant Users full control to logs directory specifically for runtime logging
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs" /grant Users:(OI)(CI)F /T'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "Logs directory Users permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "Logs directory Users permissions: FAILED (exit code: $0)"
        Call LogWrite
    ${EndIf}

    ; Grant Administrators full control to logs directory
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs" /grant Administrators:(OI)(CI)F /T'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "Logs directory Administrators permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "Logs directory Administrators permissions: FAILED (exit code: $0)"
        Call LogWrite
    ${EndIf}

    ; Create runtime log file with open permissions
    StrCpy $R9 "Creating runtime log file with open permissions"
    Call LogWrite

    ; Create empty file (application will write its own header)
    FileOpen $8 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs\runtime_${APP_VERSION}.log" w
    FileClose $8

    ; Set permissions on runtime log file to allow Users to write
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\logs\runtime_${APP_VERSION}.log" /grant Users:(M)'
    Pop $0
    ${If} $0 == 0
        StrCpy $R9 "Runtime log file Users permissions: SUCCESS"
        Call LogWrite
    ${Else}
        StrCpy $R9 "Runtime log file Users permissions: FAILED (exit code: $0)"
        Call LogWrite
    ${EndIf}
FunctionEnd

; Function: Create Site Config
Function CreateSiteConfig
    StrCpy $R9 "Creating site configuration file"
    Call LogWrite

    ; Get current timestamp (needed for both merge and new file creation)
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    StrCpy $InstallTimestamp "$2-$1-$0T$4:$5:$6Z"
    StrCpy $R9 "Timestamp: $InstallTimestamp"
    Call LogWrite

    ; Expand the path for logging
    StrCpy $R0 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json"
    StrCpy $R9 "Checking for existing config: $R0"
    Call LogWrite

    ; Check if settings.json already exists
    ${If} ${FileExists} "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json"
        StrCpy $R9 "Existing settings.json found - checking site_id"
        Call LogWrite

        ; Use PowerShell to properly parse JSON and compare site_id
        StrCpy $R7 "$TEMP\nsis_check_siteid_$$.ps1"
        FileOpen $R8 $R7 w
        FileWrite $R8 'try {$\r$\n'
        FileWrite $R8 '    $$content = Get-Content -Path "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json" -Raw$\r$\n'
        FileWrite $R8 '    $$config = ConvertFrom-Json -InputObject $$content$\r$\n'
        FileWrite $R8 '    if ($$config.site_id -eq "$SiteSecret") {$\r$\n'
        FileWrite $R8 '        Write-Output "SITE_ID_MATCH"$\r$\n'
        FileWrite $R8 '    } else {$\r$\n'
        FileWrite $R8 '        Write-Output "SITE_ID_MISMATCH"$\r$\n'
        FileWrite $R8 '    }$\r$\n'
        FileWrite $R8 '} catch {$\r$\n'
        FileWrite $R8 '    Write-Output "SITE_ID_ERROR: $$_"$\r$\n'
        FileWrite $R8 '}$\r$\n'
        FileClose $R8

        nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R7"'
        Pop $R0  ; exit code
        Pop $R1  ; output
        Delete $R7

        ; Log the comparison result
        StrCpy $R9 "site_id check result: $R1"
        Call LogWrite

        ; Check result
        ${StrStr} $R3 $R1 "SITE_ID_MATCH"

        ${If} $R3 != ""
            StrCpy $R9 "site_id matches - keeping existing config"
            Call LogWrite
            Return
        ${Else}
            StrCpy $R9 "site_id differs - selective update (new site_id, clear registration, preserve other settings)"
            Call LogWrite

            ; Use PowerShell to selectively update the existing config
            StrCpy $R7 "$TEMP\nsis_update_config_$$.ps1"
            FileOpen $R8 $R7 w
            FileWrite $R8 'try {$\r$\n'
            FileWrite $R8 '    $$settingsPath = "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json"$\r$\n'
            FileWrite $R8 '    $$content = Get-Content -Path $$settingsPath -Raw -ErrorAction Stop$\r$\n'
            FileWrite $R8 '    $$config = ConvertFrom-Json -InputObject $$content$\r$\n'
            FileWrite $R8 '    $\r$\n'
            FileWrite $R8 '    # Update site_id to the new value$\r$\n'
            FileWrite $R8 '    $$config.site_id = "$SiteSecret"$\r$\n'
            FileWrite $R8 '    $\r$\n'
            FileWrite $R8 '    # Clear registration fields to force re-registration$\r$\n'
            FileWrite $R8 '    if ($$config.PSObject.Properties["device_id"]) { $$config.PSObject.Properties.Remove("device_id") }$\r$\n'
            FileWrite $R8 '    if ($$config.PSObject.Properties["guid"]) { $$config.PSObject.Properties.Remove("guid") }$\r$\n'
            FileWrite $R8 '    if ($$config.PSObject.Properties["registered_at"]) { $$config.PSObject.Properties.Remove("registered_at") }$\r$\n'
            FileWrite $R8 '    $\r$\n'
            FileWrite $R8 '    # Write back - all other fields (api_host, show_tray, hostname, installed_at, etc.) are preserved$\r$\n'
            FileWrite $R8 '    $$json = ($$config | ConvertTo-Json -Depth 10) -replace "  ", " "$\r$\n'
            FileWrite $R8 '    [System.IO.File]::WriteAllText($$settingsPath, $$json, [System.Text.UTF8Encoding]::new($$false))$\r$\n'
            FileWrite $R8 '    Write-Output "UPDATE_SUCCESS"$\r$\n'
            FileWrite $R8 '    exit 0$\r$\n'
            FileWrite $R8 '} catch {$\r$\n'
            FileWrite $R8 '    Write-Output "UPDATE_ERROR: $$_"$\r$\n'
            FileWrite $R8 '    exit 1$\r$\n'
            FileWrite $R8 '}$\r$\n'
            FileClose $R8

            nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R7"'
            Pop $R0  ; exit code
            Pop $R1  ; output
            Delete $R7

            StrCpy $R9 "Selective update result: $R1"
            Call LogWrite

            ${StrStr} $R4 $R1 "UPDATE_SUCCESS"
            ${If} $R4 != ""
                StrCpy $R9 "Config selectively updated - device will re-register with new site"
                Call LogWrite
                Return
            ${EndIf}

            StrCpy $R9 "WARNING: Selective update failed - falling through to full overwrite"
            Call LogWrite
        ${EndIf}
    ${Else}
        StrCpy $R9 "No existing settings.json found - creating fresh config"
        Call LogWrite
    ${EndIf}

    StrCpy $R9 "Creating new settings.json"
    Call LogWrite

    ; Create settings.json with site_id and api_host
    ClearErrors
    FileOpen $8 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json" w
    ${If} ${Errors}
        StrCpy $R9 "ERROR: Could not create settings.json"
        Call LogWrite

        SetErrorLevel 6
        Abort
    ${EndIf}

    FileWrite $8 '{$\r$\n'
    FileWrite $8 '  "site_id": "$SiteSecret",$\r$\n'
    FileWrite $8 '  "api_host": "$ApiHost",$\r$\n'
    FileWrite $8 '  "show_tray": $ShowAgent,$\r$\n'
    FileWrite $8 '  "installed_at": "$InstallTimestamp"$\r$\n'
    FileWrite $8 '}'
    FileClose $8

    StrCpy $R9 "settings.json created successfully"
    Call LogWrite

    ; Set permissions on settings.json using icacls
    StrCpy $R9 "Setting permissions on settings.json"
    Call LogWrite

    ; Grant Users read permissions
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json" /grant Users:R'
    Pop $0
    StrCpy $R9 "Users read permissions: exit code $0"
    Call LogWrite

    ; Grant Administrators full control
    nsExec::ExecToLog 'icacls "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json" /grant Administrators:F'
    Pop $0
    StrCpy $R9 "Administrators full permissions: exit code $0"
    Call LogWrite

    ; Test if file is readable
    ClearErrors
    FileOpen $8 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json" r
    ${If} ${Errors}
        StrCpy $R9 "WARNING: Could not verify settings.json is readable"
        Call LogWrite
    ${Else}
        FileClose $8
        StrCpy $R9 "Verified settings.json is readable"
        Call LogWrite
    ${EndIf}
FunctionEnd


; Function: Check Remove Config Data (for uninstall)
Function un.CheckRemoveConfigData
    StrCpy $R9 "Checking for configuration data"
    Call un.LogWrite

    ; Expand the path for logging
    StrCpy $R0 "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"
    StrCpy $R9 "Looking for config directory: $R0"
    Call un.LogWrite

    ; Check if ProgramData directory exists
    ${If} ${FileExists} "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\*.*"
        StrCpy $R9 "Configuration directory exists"
        Call un.LogWrite
        StrCpy $R9 "Listing files:"
        Call un.LogWrite

        ; List files for logging
        ${If} ${FileExists} "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\settings.json"
            StrCpy $R9 "  - settings.json"
            Call un.LogWrite
        ${EndIf}

        ; Remove all configuration data
        StrCpy $R9 "Removing configuration directory..."
        Call un.LogWrite
        RMDir /r "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}"

        ${If} ${FileExists} "$COMMONPROGRAMDATA\${CONFIG_DIR_NAME}\*.*"
            StrCpy $R9 "WARNING: Some files could not be removed"
            Call un.LogWrite
        ${Else}
            StrCpy $R9 "Configuration directory removed successfully"
            Call un.LogWrite
        ${EndIf}
    ${Else}
        StrCpy $R9 "No configuration directory found"
        Call un.LogWrite
    ${EndIf}
FunctionEnd
