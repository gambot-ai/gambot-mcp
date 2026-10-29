# Bind mcp.gambot.co.il to the hosted MCP (Azure App Service "gambot-mcp") with a free managed certificate.
#
# 1) Create these DNS records first (at the gambot.co.il DNS provider):
#      CNAME  mcp           ->  gambot-mcp.azurewebsites.net
#      TXT    asuid.mcp     ->  50A6F837B21531BE8B7FA5ABE1B9DD4B153BC1F29713AC7D0ED11CEC47870279
# 2) Wait until `nslookup -type=CNAME mcp.gambot.co.il` resolves, then run:  .\scripts\bind-custom-domain.ps1
#
# The default hostname (gambot-mcp.azurewebsites.net) keeps working, so existing OAuth connectors are not broken.
# To make mcp.gambot.co.il the OAuth issuer / advertised URL, set PUBLIC_BASE_URL=https://mcp.gambot.co.il
# (re-connect existing connectors afterwards) - pass -SetPublicBaseUrl.
param(
  [string]$App = "gambot-mcp",
  [string]$ResourceGroup = "Gambot_Resource_Group",
  [string]$Hostname = "mcp.gambot.co.il",
  [switch]$SetPublicBaseUrl
)
$ErrorActionPreference = "Stop"

Write-Host "Checking DNS for $Hostname ..."
# Ask the zone's authoritative server (local/public resolvers may still hold a negative cache for a while).
$cname = (Resolve-DnsName -Name $Hostname -Type CNAME -Server park1.livedns.co.il -ErrorAction SilentlyContinue | Where-Object NameHost).NameHost
if (-not $cname -or $cname -notmatch "gambot-mcp\.azurewebsites\.net") {
  throw "CNAME for $Hostname does not point to $App.azurewebsites.net yet (got: '$cname'). Create the DNS records first."
}

Write-Host "Adding hostname binding ..."
az webapp config hostname add --webapp-name $App --resource-group $ResourceGroup --hostname $Hostname | Out-Null

Write-Host "Creating managed certificate ..."
az webapp config ssl create --name $App --resource-group $ResourceGroup --hostname $Hostname | Out-Null
$thumb = (az webapp config ssl list --resource-group $ResourceGroup -o json | ConvertFrom-Json | Where-Object { $_.subjectName -eq $Hostname } | Select-Object -First 1).thumbprint
if (-not $thumb) { throw "Managed certificate for $Hostname was not created." }

Write-Host "Binding the certificate (SNI) ..."
az webapp config ssl bind --name $App --resource-group $ResourceGroup --certificate-thumbprint $thumb --ssl-type SNI | Out-Null

if ($SetPublicBaseUrl) {
  Write-Host "Setting PUBLIC_BASE_URL ..."
  az webapp config appsettings set --name $App --resource-group $ResourceGroup --settings "PUBLIC_BASE_URL=https://$Hostname" | Out-Null
}

Write-Host "Verifying https://$Hostname/health ..."
(Invoke-WebRequest -UseBasicParsing "https://$Hostname/health").StatusCode
