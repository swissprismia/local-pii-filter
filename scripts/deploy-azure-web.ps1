param(
  [Parameter(Mandatory = $true)]
  [string]$AccountName,

  [string]$Source = "dist",

  [switch]$Build,

  [switch]$CacheModel
)

$ErrorActionPreference = "Stop"

if ($CacheModel) {
  npm run cache:model
}

if ($Build) {
  npm run build
}

if (-not (Test-Path $Source)) {
  throw "Static build folder not found: $Source. Run npm run build first."
}

$az = Get-Command az -ErrorAction SilentlyContinue
if (-not $az) {
  throw "Azure CLI was not found. Install Azure CLI and run az login first."
}

Write-Host "Uploading $Source to Azure Storage static website container `$web..."
az storage blob upload-batch `
  --account-name $AccountName `
  --destination '$web' `
  --source $Source `
  --overwrite `
  --auth-mode login | Out-Host

$files = Get-ChildItem -Path $Source -Recurse -File

foreach ($file in $files) {
  $relativeName = $file.FullName.Substring((Resolve-Path $Source).Path.Length).TrimStart("\", "/") -replace "\\", "/"
  $extension = $file.Extension.ToLowerInvariant()
  $cacheControl = "public, max-age=31536000, immutable"
  $contentType = "application/octet-stream"

  switch ($extension) {
    ".html" {
      $contentType = "text/html; charset=utf-8"
      $cacheControl = "no-cache"
    }
    ".js" {
      $contentType = "text/javascript; charset=utf-8"
    }
    ".css" {
      $contentType = "text/css; charset=utf-8"
    }
    ".json" {
      $contentType = "application/json; charset=utf-8"
      $cacheControl = "public, max-age=3600"
    }
    ".wasm" {
      $contentType = "application/wasm"
    }
    ".onnx" {
      $contentType = "application/octet-stream"
    }
    ".onnx_data" {
      $contentType = "application/octet-stream"
    }
    ".png" {
      $contentType = "image/png"
    }
    ".svg" {
      $contentType = "image/svg+xml"
    }
    ".ttf" {
      $contentType = "font/ttf"
    }
  }

  az storage blob update `
    --account-name $AccountName `
    --container-name '$web' `
    --name $relativeName `
    --content-type $contentType `
    --content-cache-control $cacheControl `
    --auth-mode login | Out-Null
}

Write-Host "Deployment complete."
Write-Host "Static website endpoint:"
az storage account show `
  --name $AccountName `
  --query "primaryEndpoints.web" `
  --output tsv | Out-Host
