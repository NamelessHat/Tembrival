param([string]$UiSource = '', [string]$OutputApk = '', [string]$SdkRoot = $env:ANDROID_SDK_ROOT, [string]$JdkRoot = $env:JAVA_HOME, [string]$BuildToolsVersion = '35.0.0', [switch]$Unsigned, [string]$KeyStore = '', [string]$KeyAlias = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageInfo = Get-Content "$projectRoot/package.json" -Raw | ConvertFrom-Json
if (-not $SdkRoot -or -not $JdkRoot) { throw 'Set ANDROID_SDK_ROOT and JAVA_HOME, or pass -SdkRoot and -JdkRoot.' }
$buildTools = Join-Path $SdkRoot "build-tools/$BuildToolsVersion"
foreach ($requiredTool in @("$JdkRoot/bin/javac.exe", "$buildTools/aapt2.exe", "$SdkRoot/platforms/android-35/android.jar")) { if (-not (Test-Path -LiteralPath $requiredTool)) { throw "Missing SDK/JDK tool: $requiredTool" } }
$env:JAVA_HOME = $jdkRoot
$env:PATH = "$jdkRoot/bin;$env:PATH"
$buildDir = "$PSScriptRoot/build"
New-Item -ItemType Directory -Force -Path "$buildDir/classes", "$buildDir/dex", "$buildDir/assets", "$projectRoot/release" | Out-Null
$assetRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'build/assets'))
if ([System.IO.Path]::GetFullPath("$buildDir/assets") -ne $assetRoot) { throw 'Invalid asset cleanup directory' }
if (Test-Path -LiteralPath $assetRoot) { foreach ($item in Get-ChildItem -LiteralPath $assetRoot -Force) { if (-not $item.FullName.StartsWith($assetRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe asset path' }; Remove-Item -LiteralPath $item.FullName -Recurse -Force } }
if (-not $UiSource) { $UiSource = "$projectRoot/ui" }
Copy-Item "$UiSource/*" "$buildDir/assets" -Force -Recurse
& "$buildTools/aapt2.exe" compile --dir "$PSScriptRoot/res" -o "$buildDir/resources.zip"
if ($LASTEXITCODE -ne 0) { throw 'Resource compilation failed' }
& "$buildTools/aapt2.exe" link -0 wav -o "$buildDir/base.apk" -I "$sdkRoot/platforms/android-35/android.jar" --manifest "$PSScriptRoot/AndroidManifest.xml" --replace-version --version-code $packageInfo.androidVersionCode --version-name $packageInfo.version --java "$buildDir/generated" -A "$buildDir/assets" "$buildDir/resources.zip"
if ($LASTEXITCODE -ne 0) { throw 'Resource linking failed' }
$badging=(& "$buildTools/aapt2.exe" dump badging "$buildDir/base.apk") -join "`n"
if ($LASTEXITCODE -ne 0 -or $badging -notmatch ("versionCode='"+[regex]::Escape([string]$packageInfo.androidVersionCode)+"'") -or $badging -notmatch ("versionName='"+[regex]::Escape([string]$packageInfo.version)+"'")) { throw 'Linked Android manifest has the wrong release version' }
$sources = @(Get-ChildItem "$PSScriptRoot/src", "$buildDir/generated" -Filter '*.java' -Recurse | ForEach-Object FullName)
& "$jdkRoot/bin/javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath "$sdkRoot/platforms/android-35/android.jar" -d "$buildDir/classes" @sources
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
& "$jdkRoot/bin/jar.exe" cf "$buildDir/classes.jar" -C "$buildDir/classes" .
& "$buildTools/d8.bat" --min-api 26 --lib "$sdkRoot/platforms/android-35/android.jar" --output "$buildDir/dex" "$buildDir/classes.jar"
if ($LASTEXITCODE -ne 0) { throw 'DEX compilation failed' }
Copy-Item "$buildDir/base.apk" "$buildDir/unsigned.apk" -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Windows aapt2 can put backslashes in nested asset entry names; Android AssetManager expects '/'.
$assetZip = [System.IO.Compression.ZipFile]::Open("$buildDir/unsigned.apk", [System.IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($entry in @($assetZip.Entries)) {
    if ($entry.FullName.Contains('\')) {
      $normalizedName = $entry.FullName.Replace('\', '/')
      $entryMemory = [System.IO.MemoryStream]::new()
      $entryInput = $entry.Open()
      try { $entryInput.CopyTo($entryMemory) } finally { $entryInput.Dispose() }
      $entry.Delete()
      $compression = if ($normalizedName.EndsWith('.wav')) { [System.IO.Compression.CompressionLevel]::NoCompression } else { [System.IO.Compression.CompressionLevel]::Optimal }
      $normalizedEntry = $assetZip.CreateEntry($normalizedName, $compression)
      $entryOutput = $normalizedEntry.Open()
      try { $entryMemory.Position = 0; $entryMemory.CopyTo($entryOutput) } finally { $entryOutput.Dispose(); $entryMemory.Dispose() }
    }
  }
} finally { $assetZip.Dispose() }
Push-Location "$buildDir/dex"
try { & "$jdkRoot/bin/jar.exe" uf "$buildDir/unsigned.apk" classes.dex } finally { Pop-Location }
& "$buildTools/zipalign.exe" -f 4 "$buildDir/unsigned.apk" "$buildDir/aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed' }
if ($Unsigned) {
  Copy-Item -LiteralPath "$buildDir/aligned.apk" -Destination "$projectRoot/release/Tembrival-Android.apk" -Force
  Write-Output 'Unsigned APK: for inspection only; Android requires a signed APK for installation.'
} else {
  if (-not $KeyStore -or -not $KeyAlias -or -not $env:TEMBRIVAL_STORE_PASSWORD -or -not $env:TEMBRIVAL_KEY_PASSWORD) { throw 'Supply your own -KeyStore and -KeyAlias and set TEMBRIVAL_STORE_PASSWORD / TEMBRIVAL_KEY_PASSWORD. Official signing credentials are not included.' }
  & "$buildTools/apksigner.bat" sign --ks $KeyStore --ks-key-alias $KeyAlias --ks-pass env:TEMBRIVAL_STORE_PASSWORD --key-pass env:TEMBRIVAL_KEY_PASSWORD --out "$projectRoot/release/Tembrival-Android.apk" "$buildDir/aligned.apk"
  if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }
  & "$buildTools/apksigner.bat" verify --verbose "$projectRoot/release/Tembrival-Android.apk"
  if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
}
$verifiedZip = [System.IO.Compression.ZipFile]::OpenRead("$projectRoot/release/Tembrival-Android.apk")
try {
  if ($null -eq $verifiedZip.GetEntry('assets/library-actions.js')) { throw 'Missing Android deletion actions' }
  if ($null -eq $verifiedZip.GetEntry('assets/network.js')) { throw 'Missing Android network actions' }
  foreach ($module in @('collections.js','device-sound.js','record-palette.js','living.js','living.css','journal.js','journal.css','theme.js','theme.css','reflection.css')) { if ($null -eq $verifiedZip.GetEntry("assets/$module")) { throw "Missing Android asset: $module" } }
  foreach ($assetPath in @('assets/assets/alpine-radio.png', 'assets/assets/night-altitude.png', 'assets/trail.css', 'assets/music-tools.js', 'assets/sound.js', 'assets/settings.js', 'assets/settings.css', 'assets/playlist-sync.js', 'assets/track-actions.js', 'assets/details.css', 'assets/compact.css', 'assets/cover-editor.js', 'assets/popover.js', 'assets/navigation.js', 'assets/assets/PressStart2P-Regular.ttf')) {
    if ($null -eq $verifiedZip.GetEntry($assetPath)) { throw "Missing Android asset: $assetPath" }
  }
  foreach ($scene in @('wind','snow','fire')) {
    $entry = $verifiedZip.GetEntry("assets/assets/ambient-$scene.wav")
    if ($null -eq $entry -or $entry.Length -ne $entry.CompressedLength) { throw "Ambient asset must be stored uncompressed: $scene" }
  }
} finally { $verifiedZip.Dispose() }
& node "$projectRoot/tests/android-assets.cjs" "$projectRoot/release/Tembrival-Android.apk"
if ($LASTEXITCODE -ne 0) { throw 'Android UI assets are missing or blocked by the compiled resource policy' }
if ($OutputApk) { Copy-Item -LiteralPath "$projectRoot/release/Tembrival-Android.apk" -Destination $OutputApk -Force }

