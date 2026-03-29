# GIP Equipment Monitoring — PowerShell HTTP Server
# Reads Excel sheets into memory, serves frontend, provides REST API

$ErrorActionPreference = "Stop"
$Port = 8080
$Root = if ($env:GIP_ROOT) { (Resolve-Path $env:GIP_ROOT).Path } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$DataDir = Join-Path $Root "data"
$FrontendDir = Join-Path $Root "frontend"

# ── Load bundled ImportExcel module ────────────────────────────────────
Import-Module (Join-Path $Root "modules\ImportExcel\ImportExcel.psd1") -Force

# ── Read Excel files into memory ────────────────────────────────────────
function Read-AllData {
    $global:DATA = @{}

    $fleetPath = Join-Path $DataDir "equipment_fleet.xlsx"
    $projectsPath = Join-Path $DataDir "construction_projects.xlsx"
    $trackingPath = Join-Path $DataDir "equipment_tracking.xlsx"
    $detailsPath = Join-Path $DataDir "equipment_details.xlsx"

    if (Test-Path $fleetPath) {
        $rows = Import-Excel -Path $fleetPath
        $global:DATA["fleet"] = @($rows | ForEach-Object {
            $h = [ordered]@{}
            $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
            $h
        })
    } else { $global:DATA["fleet"] = @() }

    if (Test-Path $projectsPath) {
        $rows = Import-Excel -Path $projectsPath
        $global:DATA["projects"] = @($rows | ForEach-Object {
            $h = [ordered]@{}
            $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
            $h
        })
    } else { $global:DATA["projects"] = @() }

    if (Test-Path $trackingPath) {
        $rows = Import-Excel -Path $trackingPath
        if ($rows) {
            $global:DATA["tracking"] = @($rows | ForEach-Object {
                $h = [ordered]@{}
                $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
                $h
            })
        } else { $global:DATA["tracking"] = @() }
    } else { $global:DATA["tracking"] = @() }

    if (Test-Path $detailsPath) {
        $rows = Import-Excel -Path $detailsPath
        if ($rows) {
            $global:DATA["details"] = @($rows | ForEach-Object {
                $h = [ordered]@{}
                $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
                $h
            })
        } else { $global:DATA["details"] = @() }
    } else { $global:DATA["details"] = @() }

    # Logs
    $logsPath = Join-Path $DataDir "equipment_logs.xlsx"
    if (Test-Path $logsPath) {
        $rows = Import-Excel -Path $logsPath
        if ($rows) {
            $global:DATA["logs"] = @($rows | ForEach-Object {
                $h = [ordered]@{}
                $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
                $h
            })
        } else { $global:DATA["logs"] = @() }
    } else { $global:DATA["logs"] = @() }

    Write-Host "Loaded: $($global:DATA['fleet'].Count) fleet, $($global:DATA['projects'].Count) projects, $($global:DATA['tracking'].Count) tracking, $($global:DATA['details'].Count) details, $($global:DATA['logs'].Count) logs" -ForegroundColor Green
}

Read-AllData

# ── Save in-memory data back to Excel ───────────────────────────────────
function Save-AllData {
    # Tracking
    $trackingPath = Join-Path $DataDir "equipment_tracking.xlsx"
    if ($global:DATA["tracking"].Count -gt 0) {
        $global:DATA["tracking"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $trackingPath -WorksheetName "Sheet1" -ClearSheet
    } else {
        # Write empty file with headers
        [PSCustomObject]@{
            Equipment_ID=""; Description=""; Status=""; Assigned_Project="";
            Assigned_Start_Date=""; Expected_End_Date=""
        } | Export-Excel -Path $trackingPath -WorksheetName "Sheet1" -ClearSheet
        # Re-import to clear dummy row — just overwrite with headers only
        Import-Module ImportExcel
        $pkg = Open-ExcelPackage -Path $trackingPath
        $ws = $pkg.Workbook.Worksheets["Sheet1"]
        if ($ws.Dimension.Rows -gt 1) {
            $ws.DeleteRow(2)
        }
        Close-ExcelPackage $pkg
    }

    # Details
    $detailsPath = Join-Path $DataDir "equipment_details.xlsx"
    if ($global:DATA["details"].Count -gt 0) {
        $global:DATA["details"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $detailsPath -WorksheetName "Sheet1" -ClearSheet
    } else {
        [PSCustomObject]@{
            Equipment_ID=""; Current_Status=""; Hours_Since_Deployment="";
            Maintenance_Hours=""; Total_Operated_Hours=""; Notes=""
        } | Export-Excel -Path $detailsPath -WorksheetName "Sheet1" -ClearSheet
        $pkg = Open-ExcelPackage -Path $detailsPath
        $ws = $pkg.Workbook.Worksheets["Sheet1"]
        if ($ws.Dimension.Rows -gt 1) {
            $ws.DeleteRow(2)
        }
        Close-ExcelPackage $pkg
    }

    # Fleet
    $fleetPath = Join-Path $DataDir "equipment_fleet.xlsx"
    if ($global:DATA["fleet"].Count -gt 0) {
        $global:DATA["fleet"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $fleetPath -WorksheetName "Sheet1" -ClearSheet
    }

    # Projects
    $projectsPath = Join-Path $DataDir "construction_projects.xlsx"
    if ($global:DATA["projects"].Count -gt 0) {
        $global:DATA["projects"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $projectsPath -WorksheetName "Sheet1" -ClearSheet
    }

    # Logs
    Save-Logs

    Write-Host "Data saved to Excel files." -ForegroundColor Green
}

# ── Save logs to Excel ──────────────────────────────────────────────────
function Save-Logs {
    $logsPath = Join-Path $DataDir "equipment_logs.xlsx"
    if ($global:DATA["logs"].Count -gt 0) {
        $global:DATA["logs"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $logsPath -WorksheetName "Sheet1" -ClearSheet
    }
}

# ── Save details sheet immediately ─────────────────────────────────────
function Save-Details {
    $detailsPath = Join-Path $DataDir "equipment_details.xlsx"
    if ($global:DATA["details"].Count -gt 0) {
        $global:DATA["details"] | ForEach-Object { [PSCustomObject]$_ } |
            Export-Excel -Path $detailsPath -WorksheetName "Sheet1" -ClearSheet
    }
}

# ── MIME types ──────────────────────────────────────────────────────────
$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

# ── Helper: send JSON response ──────────────────────────────────────────
function Send-Json($response, $obj) {
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentType = "application/json; charset=utf-8"
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.OutputStream.Close()
}

# ── Helper: read JSON body ──────────────────────────────────────────────
function Read-JsonBody($request) {
    $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return ($body | ConvertFrom-Json)
}

# ── Start HTTP listener ────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   GIP Equipment Monitoring Server Running    ║" -ForegroundColor Cyan
Write-Host "║   http://localhost:$Port                      ║" -ForegroundColor Cyan
Write-Host "║   Press Ctrl+C to stop                       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Open browser
Start-Process "http://localhost:$Port"

# ── Request loop ────────────────────────────────────────────────────────
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $path = $request.Url.LocalPath
        $method = $request.HttpMethod

        Write-Host "$method $path" -ForegroundColor Gray

        try {
            # ── API routes ──────────────────────────────────────────────
            if ($path -eq "/api/data" -and $method -eq "GET") {
                Send-Json $response @{
                    fleet    = $global:DATA["fleet"]
                    projects = $global:DATA["projects"]
                    tracking = $global:DATA["tracking"]
                    details  = $global:DATA["details"]
                }
            }
            elseif ($path -eq "/api/fleet" -and $method -eq "GET") {
                Send-Json $response @{ fleet = $global:DATA["fleet"] }
            }
            elseif ($path -eq "/api/projects" -and $method -eq "GET") {
                Send-Json $response @{ projects = $global:DATA["projects"] }
            }
            elseif ($path -eq "/api/fleet/edit" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $id = $body.Equipment_ID
                $found = $false
                for ($i = 0; $i -lt $global:DATA["fleet"].Count; $i++) {
                    if ($global:DATA["fleet"][$i]["Equipment_ID"] -eq $id) {
                        if ($body.Description -ne $null) { $global:DATA["fleet"][$i]["Description"] = $body.Description }
                        if ($body.Corporate_Rate -ne $null) { $global:DATA["fleet"][$i]["Corporate_Rate"] = $body.Corporate_Rate }
                        $found = $true
                        break
                    }
                }
                Send-Json $response @{ success = $found; fleet = $global:DATA["fleet"] }
            }
            elseif ($path -eq "/api/fleet/add" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $entry = [ordered]@{
                    Equipment_ID   = $body.Equipment_ID
                    Description    = $body.Description
                    Corporate_Rate = if ($body.Corporate_Rate) { $body.Corporate_Rate } else { 0 }
                }
                $global:DATA["fleet"] += $entry
                Send-Json $response @{ success = $true; fleet = $global:DATA["fleet"] }
            }
            elseif ($path -eq "/api/fleet/delete" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $id = $body.Equipment_ID
                $global:DATA["fleet"] = @($global:DATA["fleet"] | Where-Object { $_["Equipment_ID"] -ne $id })
                Send-Json $response @{ success = $true; fleet = $global:DATA["fleet"] }
            }
            elseif ($path -eq "/api/tracking/add" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $entry = [ordered]@{
                    Equipment_ID       = $body.Equipment_ID
                    Description        = $body.Description
                    Status             = if ($body.Status) { $body.Status } else { "Available" }
                    Assigned_Project   = if ($body.Assigned_Project) { $body.Assigned_Project } else { "" }
                    Assigned_Start_Date = if ($body.Assigned_Start_Date) { $body.Assigned_Start_Date } else { "" }
                    Expected_End_Date  = if ($body.Expected_End_Date) { $body.Expected_End_Date } else { "" }
                }
                $global:DATA["tracking"] += $entry

                # Also create a details entry
                $detailEntry = [ordered]@{
                    Equipment_ID          = $body.Equipment_ID
                    Current_Status        = if ($body.Status) { $body.Status } else { "Available" }
                    Hours_Since_Deployment = 0
                    Maintenance_Hours     = 0
                    Total_Operated_Hours  = 0
                    Notes                 = ""
                }
                $global:DATA["details"] += $detailEntry

                Send-Json $response @{ success = $true; tracking = $global:DATA["tracking"]; details = $global:DATA["details"] }
            }
            elseif ($path -eq "/api/tracking/edit" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $id = $body.Equipment_ID
                for ($i = 0; $i -lt $global:DATA["tracking"].Count; $i++) {
                    if ($global:DATA["tracking"][$i]["Equipment_ID"] -eq $id) {
                        if ($body.Status) { $global:DATA["tracking"][$i]["Status"] = $body.Status }
                        if ($body.Assigned_Project -ne $null) { $global:DATA["tracking"][$i]["Assigned_Project"] = $body.Assigned_Project }
                        if ($body.Assigned_Start_Date -ne $null) { $global:DATA["tracking"][$i]["Assigned_Start_Date"] = $body.Assigned_Start_Date }
                        if ($body.Expected_End_Date -ne $null) { $global:DATA["tracking"][$i]["Expected_End_Date"] = $body.Expected_End_Date }
                        break
                    }
                }
                Send-Json $response @{ success = $true; tracking = $global:DATA["tracking"] }
            }
            elseif ($path -eq "/api/details/edit" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $id = $body.Equipment_ID
                for ($i = 0; $i -lt $global:DATA["details"].Count; $i++) {
                    if ($global:DATA["details"][$i]["Equipment_ID"] -eq $id) {
                        if ($body.Current_Status -ne $null) { $global:DATA["details"][$i]["Current_Status"] = $body.Current_Status }
                        if ($body.Hours_Since_Deployment -ne $null) { $global:DATA["details"][$i]["Hours_Since_Deployment"] = $body.Hours_Since_Deployment }
                        if ($body.Maintenance_Hours -ne $null) { $global:DATA["details"][$i]["Maintenance_Hours"] = $body.Maintenance_Hours }
                        if ($body.Total_Operated_Hours -ne $null) { $global:DATA["details"][$i]["Total_Operated_Hours"] = $body.Total_Operated_Hours }
                        if ($body.Notes -ne $null) { $global:DATA["details"][$i]["Notes"] = $body.Notes }
                        break
                    }
                }
                # Also sync status back to tracking
                for ($i = 0; $i -lt $global:DATA["tracking"].Count; $i++) {
                    if ($global:DATA["tracking"][$i]["Equipment_ID"] -eq $id) {
                        if ($body.Current_Status -ne $null) { $global:DATA["tracking"][$i]["Status"] = $body.Current_Status }
                        break
                    }
                }
                # Create a log entry
                $logEntry = [ordered]@{
                    Timestamp              = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    Equipment_ID           = $id
                    Current_Status         = $body.Current_Status
                    Hours_Since_Deployment = $body.Hours_Since_Deployment
                    Maintenance_Hours      = $body.Maintenance_Hours
                    Total_Operated_Hours   = $body.Total_Operated_Hours
                    Notes                  = $body.Notes
                }
                $global:DATA["logs"] += $logEntry
                # Write details + logs to Excel immediately
                Save-Details
                Save-Logs
                Write-Host "Details updated and logged for $id" -ForegroundColor Green
                Send-Json $response @{ success = $true; details = $global:DATA["details"]; tracking = $global:DATA["tracking"] }
            }
            elseif ($path -eq "/api/logs" -and $method -eq "POST") {
                $body = Read-JsonBody $request
                $id = $body.Equipment_ID
                $equipLogs = @($global:DATA["logs"] | Where-Object { $_["Equipment_ID"] -eq $id })
                Send-Json $response @{ success = $true; logs = $equipLogs }
            }
            elseif ($path -eq "/api/save" -and $method -eq "POST") {
                Save-AllData
                Send-Json $response @{ success = $true; message = "Data saved to Excel files." }
            }
            # ── Static file serving ─────────────────────────────────────
            else {
                $filePath = if ($path -eq "/") { Join-Path $FrontendDir "index.html" }
                             else { Join-Path $FrontendDir ($path.TrimStart("/")) }

                $filePath = [System.IO.Path]::GetFullPath($filePath)
                if (-not $filePath.StartsWith([System.IO.Path]::GetFullPath($FrontendDir))) {
                    $response.StatusCode = 403
                    $response.Close()
                    continue
                }

                if (Test-Path $filePath) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
                    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                    $response.ContentType = $contentType
                    $response.ContentLength64 = $fileBytes.Length
                    $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
                    $response.OutputStream.Close()
                } else {
                    $response.StatusCode = 404
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.OutputStream.Close()
                }
            }
        }
        catch {
            Write-Host "Error: $_" -ForegroundColor Red
            try {
                $response.StatusCode = 500
                $errBuffer = [System.Text.Encoding]::UTF8.GetBytes("Internal Server Error: $_")
                $response.ContentLength64 = $errBuffer.Length
                $response.OutputStream.Write($errBuffer, 0, $errBuffer.Length)
                $response.OutputStream.Close()
            } catch {}
        }
    }
}
finally {
    $listener.Stop()
    Write-Host "Server stopped." -ForegroundColor Yellow
}
