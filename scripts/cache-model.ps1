param(
  [string]$Destination = "public/models/openai/privacy-filter",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not [System.IO.Path]::IsPathRooted($Destination)) {
  $projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
  $Destination = Join-Path $projectRoot $Destination
}

$baseUrl = "https://huggingface.co/openai/privacy-filter/resolve/main"
$files = @(
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "viterbi_calibration.json",
  "onnx/model_q4.onnx",
  "onnx/model_q4.onnx_data"
)

function Save-RemoteFile {
  param(
    [string]$Url,
    [string]$Path
  )

  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null

  if ((Test-Path $Path) -and -not $Force) {
    Write-Host "skip $Path"
    return
  }

  $tempPath = "$Path.download"
  if (Test-Path $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force
  }

  Write-Host "download $Url"

  $client = [System.Net.Http.HttpClient]::new()
  try {
    $response = $client.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
    $response.EnsureSuccessStatusCode() | Out-Null

    $inputStream = $response.Content.ReadAsStreamAsync().Result
    $outputStream = [System.IO.File]::Create($tempPath)

    try {
      $buffer = New-Object byte[] (1024 * 1024)
      $total = 0L
      $contentLength = $response.Content.Headers.ContentLength

      while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $outputStream.Write($buffer, 0, $read)
        $total += $read

        if ($contentLength) {
          $percent = [Math]::Floor(($total / $contentLength) * 100)
          Write-Progress -Activity "Caching privacy-filter model" -Status $Path -PercentComplete $percent
        }
      }
    }
    finally {
      $outputStream.Dispose()
      $inputStream.Dispose()
    }

    Move-Item -LiteralPath $tempPath -Destination $Path -Force
    Write-Host "saved $Path"
  }
  finally {
    $client.Dispose()
    if (Test-Path $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }
}

foreach ($file in $files) {
  $url = "$baseUrl/$file"
  $path = Join-Path $Destination $file
  Save-RemoteFile -Url $url -Path $path
}

Write-Host "Model cache ready: $Destination"
