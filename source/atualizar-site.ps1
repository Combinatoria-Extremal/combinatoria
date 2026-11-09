param(
    [string]$Destination,
    [switch]$ValidateOnly,
    [switch]$RequireEmptyDestination
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'scripts/update-site.py'
$scriptArguments = @($scriptPath)
if ($Destination) { $scriptArguments += @('--destination', $Destination) }
if ($ValidateOnly) { $scriptArguments += '--validate-only' }
if ($RequireEmptyDestination) { $scriptArguments += '--require-empty-destination' }

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python @scriptArguments
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 @scriptArguments
} else {
    throw 'Python 3 não foi encontrado. Instale Python 3.10 ou mais recente e abra um novo terminal.'
}
exit $LASTEXITCODE
