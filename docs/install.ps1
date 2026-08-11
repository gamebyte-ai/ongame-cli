# ongame-cli installer for Windows.
#
#   irm https://cli.ongame.ai/install.ps1 | iex
#
# The Windows twin of install.sh, and deliberately the SAME SHAPE: this script does only what genuinely
# differs per platform — architecture detection, download, checksum verification, putting the binary in
# place, PATH — and then hands every remaining step to `ongame-cli install`, the one implementation both
# installers share. Anything added here that install.sh does not also do is a future drift bug.
#
# Job, in order:
#   1. Detect the architecture (WoW64-correct), download the matching `ongame-cli-windows-x64.exe` +
#      `checksums.txt` from this repo's latest GitHub Release, verify sha256, move it into
#      %USERPROFILE%\.ongame\bin\ongame-cli.exe.
#   2. Add that bin directory to the PER-USER PATH (registry, idempotent, non-truncating) and broadcast
#      the change so newly launched processes pick it up.
#   3. Hand off to `ongame-cli install` — Claude Code plugin registration, Codex `[mcp_servers.ongame]`,
#      the version file.
#
# macOS/Linux have their own installer: `curl -fsSL https://cli.ongame.ai/install.sh | sh`.
#
# Must run on a STOCK Windows 11 box under BOTH Windows PowerShell 5.1 (the one that is always present,
# .NET Framework, no `Invoke-RestMethod` niceties from PS7) and PowerShell 7. Every construct below is
# chosen for that intersection; see the individual comments before "simplifying" any of them.

param(
  # `irm ... | iex` cannot pass parameters (the pipeline hands `iex` a plain string), so both switches
  # are also readable from the environment — that is the ONLY way to reach them in the documented
  # one-liner form. `$env:ONGAME_NO_PATH_UPDATE=1; irm https://cli.ongame.ai/install.ps1 | iex`
  [switch]$NoPathUpdate,
  [switch]$NoPluginSetup
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1's Invoke-WebRequest renders a progress bar per chunk, which on a ~100MB download
# costs FAR more wall-clock time than the transfer itself (an order of magnitude, routinely). PS7 does not
# have the problem, but silencing it is harmless there.
$ProgressPreference = 'SilentlyContinue'

if (-not $NoPathUpdate -and $env:ONGAME_NO_PATH_UPDATE) { $NoPathUpdate = $true }
if (-not $NoPluginSetup -and $env:ONGAME_NO_PLUGIN_SETUP) { $NoPluginSetup = $true }

# .NET Framework's default protocol selection on a stock 5.1 does not include TLS 1.2, and github.com /
# api.github.com refuse anything older — without this, every web call below fails with a bare
# "The request was aborted: Could not create SSL/TLS secure channel". PS7 (.NET Core) negotiates TLS 1.2+
# on its own and exposes SecurityProtocol as a legacy no-op, so only touch it on the old host.
if ($PSVersionTable.PSVersion.Major -lt 6) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

$Repo        = 'gamebyte-ai/ongame-cli'
# TEST-ONLY SEAMS, the same two names install.sh and cli/src/updater.ts already honour — so this script's
# download path (release lookup, asset URL construction, checksum verification) is exercised end to end against a
# local mock server in CI rather than being the one production path nothing ever tests. Production never sets
# them. NOT a weakening of the trust chain: the sha256 check is unconditional and checksums.txt is fetched from
# the SAME root as the binary, so the seam moves the whole chain and cannot skip a link.
$ApiRoot     = if ($env:ONGAME_LAUNCHER_API_ROOT) { $env:ONGAME_LAUNCHER_API_ROOT } else { 'https://api.github.com' }
$Api         = "$ApiRoot/repos/$Repo/releases/latest"
$GitHub      = if ($env:ONGAME_LAUNCHER_DOWNLOAD_ROOT) { $env:ONGAME_LAUNCHER_DOWNLOAD_ROOT } else { 'https://github.com' }
$UserAgent   = 'ongame-cli-install.ps1'
$BinName     = 'ongame-cli.exe'
# Same root, and the same precedence, that bin/win/ongame-launcher.c resolves at launch (%ONGAME_INSTALL_DIR%
# else %USERPROFILE%) and that install.sh uses on POSIX. If they ever disagree, the launcher looks in a
# directory the installer never wrote to and the plugin appears simply not to exist.
if (-not $env:ONGAME_INSTALL_DIR -and -not $env:USERPROFILE) {
  throw 'neither ONGAME_INSTALL_DIR nor USERPROFILE is set — cannot work out where to install. This is unusual; check how this shell was started.'
}
$InstallDir  = if ($env:ONGAME_INSTALL_DIR) { $env:ONGAME_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.ongame' }
$BinDir      = Join-Path $InstallDir 'bin'
$BinPath     = Join-Path $BinDir $BinName

# Everything this script says goes to the information stream / stderr, never stdout — same rule install.sh
# follows, and the same reason: a piped stdout must stay clean.
function Write-Step([string]$Message) { [Console]::Error.WriteLine($Message) }

# Downloads one file, preferring curl.exe.
#
# curl.exe ships in Windows 10 1803+ and Server 2019+ — every platform this installer supports — and it wins
# on the two things that actually matter for a ~115MB asset. It renders its own progress meter, so the
# install cannot be mistaken for a hung terminal (the first thing a real user reported); and it avoids
# Invoke-WebRequest's per-chunk overhead, which on Windows PowerShell 5.1 makes a large download
# dramatically slower than the connection warrants. `$ProgressPreference='SilentlyContinue'` above is what
# suppresses IWR's own bar — necessary for speed there, and precisely why IWR alone shows nothing at all.
#
# IWR stays as the fallback so a machine without curl.exe, or a curl that fails for its own reasons, still
# installs. A failure in EITHER path throws, and the caller turns that into the usual `error: ...` message.
function Get-RemoteFile([string]$Url, [string]$Path) {
  $curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($curl) {
    # -f: fail loudly on an HTTP error instead of writing the error page to disk. -L: follow the release
    # redirect to the CDN. --progress-bar: a meter on stderr, where everything else this script says goes.
    & $curl.Source -fL --progress-bar -A $UserAgent -o $Path $Url
    if ($LASTEXITCODE -eq 0) { return }
    Write-Step "  curl could not fetch it (exit $LASTEXITCODE) — retrying with PowerShell's own downloader (no progress meter; please wait)..."
  }
  Invoke-WebRequest -Uri $Url -OutFile $Path -Headers @{ 'User-Agent' = $UserAgent } -UseBasicParsing
}

# Failure reporting, kept in the same shape as install.sh's `error()`: `error: <what went wrong>` on stderr,
# then stop.
#
# ADVERSARIAL-REVIEW FIX — do NOT let the actionable text be the exception message. PowerShell renders an
# uncaught `throw` as a full error record: the "Exception: <path>:74" header, the source line of THIS helper,
# a `~~~~` squiggle under `throw $Message`, and the message itself word-wrapped into a `|`-gutter with ANSI
# colour codes. MEASURED on a real run: the multi-line antivirus/checksum guidance came out shredded across
# six gutter lines pointing at a script the user never opened (`irm | iex` — there is no file to look at).
# Printing the message plainly FIRST and throwing a short marker second keeps the record to one line and puts
# the part the user must act on in front of them, exactly as the POSIX installer does.
#
# Still `throw`, deliberately NOT `exit 1`: the documented front door is `irm ... | iex` typed at a prompt,
# where `exit` terminates the USER'S SHELL — taking the error message off the screen with it. A terminating
# error stops the install, leaves the window open, and still gives `pwsh -File` / `pwsh -Command` callers
# (and therefore CI) a non-zero exit code.
function Stop-Install([string]$Message) {
  [Console]::Error.WriteLine("error: $Message")
  throw 'ongame-cli was not installed (see the error above).'
}

# ---------------------------------------------------------------------------
# Native-command invocation, made safe under $ErrorActionPreference='Stop'.
#
# TWO separate traps, both of which would abort a perfectly successful install:
#   1. PowerShell converts a native command's STDERR into ErrorRecords whenever that stream is captured.
#      Under 'Stop' that is a terminating error. `ongame-cli install` reports EVERY outcome on stderr by
#      contract (its stdout is reserved), so a healthy run looks like a failure.
#   2. PowerShell 7.4 turns $PSNativeCommandUseErrorActionPreference on by default, which makes a non-zero
#      EXIT CODE throw as well. The liveness probe below deliberately expects exit 1.
# Assigning the two preference variables inside this function shadows them for its scope only.
# ---------------------------------------------------------------------------
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [switch]$Capture
  )
  $ErrorActionPreference = 'Continue'
  $PSNativeCommandUseErrorActionPreference = $false
  $global:LASTEXITCODE = $null
  try {
    if ($Capture) {
      $output = (& $FilePath @Arguments 2>&1 | Out-String)
    } else {
      & $FilePath @Arguments
      $output = ''
    }
    # `Launched` is keyed on $LASTEXITCODE having been SET, not on the absence of an exception: PowerShell
    # does not reliably throw when a file cannot be executed (MEASURED — invoking a non-executable file just
    # does nothing and leaves $LASTEXITCODE untouched). A never-set exit code is the one signal that means
    # "no process ever ran", which is exactly the antivirus/blocked-image case this has to catch.
    if ($null -eq $LASTEXITCODE) {
      return [pscustomobject]@{ Launched = $false; ExitCode = $null; Output = $output; Error = 'the file could not be executed (no process was started)' }
    }
    return [pscustomobject]@{ Launched = $true; ExitCode = $LASTEXITCODE; Output = $output; Error = $null }
  } catch {
    # The process could not be STARTED at all (blocked by policy/antivirus, not a real PE, ...) — a
    # different and much more actionable failure than any exit code.
    return [pscustomobject]@{ Launched = $false; ExitCode = $null; Output = ''; Error = $_.Exception.Message }
  }
}

# ---------------------------------------------------------------------------
# 1. Architecture detection → this repo's release-asset naming convention.
#
# VERIFIED (not guessed) against `cli/package.json`'s build scripts + `.github/workflows/release-cli.yml`'s
# publish list: the release carries FIVE binaries, of which exactly one is reachable from here —
# `ongame-cli-windows-x64.exe`. (The other four are macOS/Linux and are install.sh's business.)
#
# PROCESSOR_ARCHITECTURE alone is WRONG under WoW64: a 32-bit PowerShell on a 64-bit machine (the
# "Windows PowerShell (x86)" shortcut, or any 32-bit host embedding PS) reports `x86` for the PROCESS,
# not the machine. Windows sets PROCESSOR_ARCHITEW6432 only in that case, carrying the real machine
# architecture — so it wins when present. Getting this wrong would dead-end a perfectly capable x64 box.
# ---------------------------------------------------------------------------
# The `''` fallback is not decoration: with both variables unset, `$null.ToUpperInvariant()` would throw
# "You cannot call a method on a null-valued expression" — a message that tells the user nothing. An empty
# string lands in the `default` branch below and reports the actual problem.
$archRaw = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } elseif ($env:PROCESSOR_ARCHITECTURE) { $env:PROCESSOR_ARCHITECTURE } else { '' }

switch ($archRaw.ToUpperInvariant()) {
  'AMD64' { $arch = 'x64' }
  'ARM64' {
    # There is no native arm64 Windows build yet. Windows 11 on ARM emulates x64 transparently, so the
    # x64 binary genuinely works — say so plainly rather than silently installing something slower than
    # the user expects (the same call install.sh makes for the Rosetta case, in the other direction:
    # there a native build exists, so it switches to it; here one does not, so it explains).
    $arch = 'x64'
    Write-Step 'Detected Windows on ARM64 — installing the x64 build, which runs under Windows'' built-in x64 emulation. It works; a native arm64 build is not published yet.'
  }
  default {
    Stop-Install "unsupported architecture: $archRaw (ongame-cli ships an x64 Windows build; 32-bit Windows is not supported)"
  }
}

$assetName = "ongame-cli-windows-$arch.exe"
Write-Step "Detected platform: windows/$arch (asset: $assetName)"

# ---------------------------------------------------------------------------
# 2. Resolve the latest release, download the binary + checksums.txt, verify.
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

Write-Step 'Looking up the latest release...'
try {
  # Invoke-RestMethod deserializes the JSON into a real object, so unlike install.sh (POSIX sh, no jq)
  # there is nothing to scrape with a regex here. GitHub rejects requests with no user-agent.
  $release = Invoke-RestMethod -Uri $Api -Headers @{ 'User-Agent' = $UserAgent } -UseBasicParsing
} catch {
  Stop-Install "could not reach the GitHub Releases API ($Api): $($_.Exception.Message)"
}
$tagName = $release.tag_name
if (-not $tagName) { Stop-Install 'could not read a release tag from the GitHub API response' }
Write-Step "Latest release: $tagName"

# CONSTRUCT the download URL; do NOT go looking for it in the `assets` array. install.sh learned this the
# expensive way (its comment at the same step records the incident): parsing the asset list is brittle
# against the real API response, while GitHub's release-download URL is a documented, stable convention
# `.../releases/download/<tag>/<filename>`. A genuinely missing or renamed asset still fails loudly — the
# download below 404s with a clear message.
function Get-DownloadUrl([string]$FileName) { "$GitHub/$Repo/releases/download/$tagName/$FileName" }

# Staged INSIDE the destination directory, never $env:TEMP: the final move must be a rename on the same
# volume (an atomic metadata operation), not a cross-volume copy that can leave a torn file behind. The
# `.update-` prefix is the one the binary's own updater already sweeps, so an interrupted install cleans
# itself up on the next launch instead of leaving ~100MB behind forever.
$tmpDir = Join-Path $BinDir ('.update-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '-' + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
try {
  $stagedBin = Join-Path $tmpDir $assetName
  $stagedSums = Join-Path $tmpDir 'checksums.txt'

  # The size is stated up front on purpose. The binary is ~115MB (the whole product, no runtime to install
  # separately), and on a normal connection that is a minute or more of nothing happening. Without a number
  # and a progress meter the install reads as HUNG — which is exactly how it was first reported.
  Write-Step "Downloading $assetName (~115 MB — this is the entire product; expect a minute or so)..."
  foreach ($item in @(@{ Url = (Get-DownloadUrl $assetName); Path = $stagedBin }, @{ Url = (Get-DownloadUrl 'checksums.txt'); Path = $stagedSums })) {
    try {
      Get-RemoteFile $item.Url $item.Path
    } catch {
      Stop-Install "download failed: $($item.Url) — $($_.Exception.Message)"
    }
  }

  # An antivirus that dislikes a freshly downloaded, unsigned executable deletes or truncates it WITHOUT
  # failing the download. Checking here means the user is told what actually happened instead of hitting a
  # baffling "file not found" three steps later.
  $staged = Get-Item -LiteralPath $stagedBin -ErrorAction SilentlyContinue
  if (-not $staged -or $staged.Length -eq 0) {
    Stop-Install "the downloaded file is missing or empty at $stagedBin — this is almost always antivirus/Defender quarantining a freshly downloaded unsigned executable. Allow $BinPath (or the ongame-cli publisher) and re-run this installer."
  }

  Write-Step 'Verifying checksum...'
  # Match on BASENAME, exactly as install.sh does and for the same measured reason: `cli/package.json`'s
  # `checksums` script `cd`s into dist-bin before running shasum, so the published file records bare
  # names. Splitting off the last path segment keeps this correct if a path prefix ever comes back, and
  # TrimStart('*') strips the binary-mode marker `sha256sum` emits (`shasum` does not).
  $expected = $null
  foreach ($line in (Get-Content -LiteralPath $stagedSums)) {
    $fields = ($line.Trim() -split '\s+')
    if ($fields.Count -lt 2) { continue }
    $base = ($fields[1] -split '/')[-1].TrimStart('*')
    if ($base -eq $assetName) { $expected = $fields[0]; break }
  }
  if (-not $expected) { Stop-Install "checksums.txt has no entry for $assetName" }

  $actual = (Get-FileHash -LiteralPath $stagedBin -Algorithm SHA256).Hash
  if ($actual -ine $expected) {
    Stop-Install "checksum mismatch for $assetName (expected $expected, got $actual) — refusing to install a binary that doesn't match its published checksum"
  }

  # -------------------------------------------------------------------------
  # Move into place. The target may be a RUNNING ongame-cli.exe (a Claude Code or Codex session that is
  # open right now), and Windows will not let a running image be overwritten or deleted — but it WILL let
  # it be renamed aside (both MEASURED on a real windows-latest runner). This is the same three-step
  # strategy the binary's own updater uses (cli/src/updater.ts, swapIntoPlace); keep them in step.
  #   a. Try the plain move-over first. Nothing holding the target (the common case) → one atomic rename.
  #   b. Otherwise rename the target aside to `.old-<ms>-<rand>` and move the new file in.
  #   c. If (b)'s second move fails, PUT THE OLD ONE BACK — leaving the target missing would break every
  #      future launch, and a broken existing install is far worse than a failed upgrade.
  # The `.old-*` aside cannot be deleted while the old process still holds it (EPERM, also measured); the
  # binary sweeps those at the start of a later launch.
  # -------------------------------------------------------------------------
  $swapped = $false
  try {
    Move-Item -LiteralPath $stagedBin -Destination $BinPath -Force   # (a)
    $swapped = $true
  } catch {
    # Nothing to move aside means (a) failed for some OTHER reason (a locked or read-only directory,
    # a policy block) — there is no recovery dance to attempt, so say so directly.
    if (-not (Test-Path -LiteralPath $BinPath)) {
      Stop-Install "could not install $BinPath — $($_.Exception.Message)"
    }
  }

  if (-not $swapped) {
    $movedAside = Join-Path $BinDir ('.old-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '-' + [System.IO.Path]::GetRandomFileName())
    Write-Step 'An ongame-cli process is holding the installed binary — renaming it aside and installing over it (close any open Claude Code / Codex session so the leftover can be swept).'
    try {
      Move-Item -LiteralPath $BinPath -Destination $movedAside      # (b1)
    } catch {
      Stop-Install "could not move the running ongame-cli aside to replace it ($($_.Exception.Message)) — your existing install is untouched and still works. Close any open Claude Code / Codex session and re-run this installer."
    }
    $swapError = $null
    try {
      Move-Item -LiteralPath $stagedBin -Destination $BinPath       # (b2)
      $swapped = $true
    } catch {
      $swapError = $_.Exception.Message
    }
    if (-not $swapped) {
      $restoreError = $null
      try { Move-Item -LiteralPath $movedAside -Destination $BinPath } catch { $restoreError = $_.Exception.Message }  # (c)
      if ($restoreError) {
        Stop-Install "could not install the new binary ($swapError) AND could not restore the previous one ($restoreError). Your working ongame-cli is saved at $movedAside — rename it back to $BinPath. The binary also restores the newest aside automatically on its next launch."
      }
      Stop-Install "could not install the new binary ($swapError) — the previous one was restored and still works."
    }
  }
} finally {
  # Best-effort: a lock on the temp dir must never turn a successful install into a failure.
  Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Assert the installed file, not the downloaded one: a real-time scanner commonly lets the download through
# and pounces on the executable the moment it lands in its final location.
$installed = Get-Item -LiteralPath $BinPath -ErrorAction SilentlyContinue
if (-not $installed -or $installed.Length -eq 0) {
  Stop-Install "$BinPath is missing or empty right after a verified install — this is almost always antivirus/Defender quarantining it. Allow that path and re-run this installer."
}

# ... and that it actually EXECUTES. ongame-cli has no `--version` subcommand, so the cheapest proof of life
# is a no-argument run: it prints its usage line to stderr and exits 1. What is being asserted is that the
# process STARTS — an image blocked by policy or a partially-quarantined file fails right here, with a
# message that names the cause, instead of surfacing later as a Claude Code MCP server that silently never
# connects.
$probe = Invoke-Native -FilePath $BinPath -Capture
if (-not $probe.Launched) {
  Stop-Install "$BinPath was installed but could not be executed ($($probe.Error)) — antivirus, SmartScreen or an execution policy is blocking it. Allow that path and re-run this installer."
}
if ($probe.Output -notmatch 'ongame-cli') {
  Write-Step "Warning: $BinPath ran but did not print the expected usage line. Continuing; if ongame does not appear in Claude Code, re-run this installer."
}

# The release tag the updater compares against to decide whether to self-update. `ongame-cli install`
# below writes the same bytes to the same path (install.sh has the same overlap) — kept here as well so
# -NoPluginSetup still leaves the updater a correct baseline instead of forcing a redundant ~100MB
# re-download on the first launch. The NAME is a contract with cli/src/updater.ts, which derives it as
# `.<binary file name>.version` — on Windows that includes the `.exe`.
# WriteAllText with an explicit no-BOM UTF8: Windows PowerShell 5.1's Set-Content/Out-File -Encoding utf8
# prepends a BOM, and the updater compares the file's contents to the release tag as a string — a BOM
# would never match, so it would re-download on every single launch.
try {
  [System.IO.File]::WriteAllText((Join-Path $BinDir ".$BinName.version"), $tagName, (New-Object System.Text.UTF8Encoding($false)))
} catch {
  Write-Step "Could not record the installed version ($($_.Exception.Message)) — ongame-cli will re-check the release API on next launch."
}

Write-Step "Installed ongame-cli $tagName -> $BinPath"

# ---------------------------------------------------------------------------
# 3. PATH — persisted to the per-user environment, in the registry.
#
# NEVER `setx`: it silently TRUNCATES the value it writes at 1024 characters, which on a developer machine
# with a normal PATH quietly destroys the tail of it. This writes the registry value directly instead.
#
# The read uses DoNotExpandEnvironmentNames, which is the whole point: a user PATH is usually REG_EXPAND_SZ
# and full of `%USERPROFILE%`-style references. Reading it normally (e.g. via
# [Environment]::GetEnvironmentVariable(...,'User')) hands back the EXPANDED text, and writing that back
# permanently bakes today's values into the user's PATH — a corruption that only shows up later, on a
# machine where those variables have changed.
# ---------------------------------------------------------------------------
function Get-NormalizedPathEntry([string]$Entry) { $Entry.Trim().TrimEnd('\') }

function Add-UserPathEntry([string]$Directory) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  if (-not $key) { $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment') }
  try {
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    # Preserve the value's existing kind rather than forcing one. REG_EXPAND_SZ is the right default (and
    # what Windows itself uses), but converting an existing REG_SZ would newly expand any literal `%` the
    # user has in there. We only ever APPEND a literal absolute path, so either kind is correct for us.
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    try {
      if ($key.GetValueKind('Path') -eq [Microsoft.Win32.RegistryValueKind]::String) { $kind = [Microsoft.Win32.RegistryValueKind]::String }
    } catch { }

    $entries = @($raw -split ';' | Where-Object { $_.Trim() -ne '' })
    $want = Get-NormalizedPathEntry $Directory
    foreach ($entry in $entries) {
      # Case-insensitive and trailing-backslash-insensitive, so running this installer three times leaves
      # exactly one entry — Windows paths compare that way and a duplicate would never be noticed by hand.
      # Deliberately a TEXTUAL comparison: an entry a user hand-wrote as `%USERPROFILE%\.ongame\bin` will not
      # match our absolute form and we would append a second, equivalent entry. That is the accepted cost of
      # never expanding anything — expanding to compare is one short step from expanding to write, which is
      # the corruption this whole function exists to avoid. Both entries point at the same directory.
      if ((Get-NormalizedPathEntry $entry) -ieq $want) { return $false }
    }
    $key.SetValue('Path', (($entries + $Directory) -join ';'), $kind)
    return $true
  } finally {
    if ($key) { $key.Dispose() }
  }
}

# A persisted environment variable is only picked up by processes started AFTER the change, and only if
# they inherit a refreshed block — Explorer (and therefore every shortcut launched from it) refreshes its
# own copy on WM_SETTINGCHANGE. Without this broadcast the user has to sign out before `ongame-cli` is
# reachable from a new terminal. Best-effort by design: a machine where Add-Type cannot compile (locked
# down, constrained language mode) still got the persisted PATH, which is the part that matters.
function Publish-EnvironmentChange {
  try {
    if (-not ('OngameNative.Win32' -as [type])) {
      Add-Type -Namespace OngameNative -Name Win32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.UIntPtr lpdwResult);
'@
    }
    $result = [UIntPtr]::Zero
    # HWND_BROADCAST = 0xFFFF, WM_SETTINGCHANGE = 0x001A, SMTO_ABORTIFHUNG = 0x0002, 5s timeout so one
    # hung top-level window cannot stall the installer.
    [void][OngameNative.Win32]::SendMessageTimeout([IntPtr]0xFFFF, 0x001A, [UIntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$result)
  } catch {
    Write-Step 'Note: could not broadcast the environment change; open a new terminal (or sign out and back in) for PATH to take effect.'
  }
}

if ($NoPathUpdate) {
  Write-Step "Skipping the PATH update (-NoPathUpdate). ongame-cli is at $BinPath."
} else {
  try {
    if (Add-UserPathEntry $BinDir) {
      Publish-EnvironmentChange
      Write-Step "Added $BinDir to your user PATH."
    } else {
      Write-Step "$BinDir is already on your user PATH."
    }
  } catch {
    Write-Step "Could not update your user PATH ($($_.Exception.Message)) — add $BinDir by hand if you want to run ongame-cli directly."
  }
  # The persisted value does not reach THIS already-running process; set it here too so the `& $exe`
  # handoff below and anything the user types next in this same window can find the binary by name.
  $sessionEntries = @($env:Path -split ';' | Where-Object { $_.Trim() -ne '' } | ForEach-Object { Get-NormalizedPathEntry $_ })
  if ($sessionEntries -notcontains (Get-NormalizedPathEntry $BinDir)) { $env:Path = "$BinDir;$env:Path" }
  Write-Step "Open a new terminal to use ongame-cli directly."
}

# ---------------------------------------------------------------------------
# 4. Post-install wiring — HANDED TO THE BINARY.
#
# `ongame-cli install` registers the Claude Code plugin (marketplace + plugin, both list-then-act guarded
# so re-running never duplicates anything, and always via the full HTTPS marketplace URL), patches Codex
# CLI's `[mcp_servers.ongame]` if %CODEX_HOME%/%USERPROFILE%\.codex exists — on Windows with the ABSOLUTE
# path to ongame-cli.exe, because Codex resolves `command` with a plain PATH lookup that does not apply
# PATHEXT — and records the installed release tag.
#
# Why it lives in the binary and not here: install.sh needs exactly the same logic, and two copies of it
# (one sh, one PowerShell) would drift within a release or two. This script keeps only what is genuinely
# per-platform. The subcommand reports every outcome on stderr and ALWAYS exits 0 by contract, so an
# absent Codex or a broken `claude` CLI can never turn a good install into a failed one.
# ---------------------------------------------------------------------------
if ($NoPluginSetup) {
  Write-Step ''
  Write-Step 'Skipping Claude Code / Codex wiring (-NoPluginSetup). Run `ongame-cli install` yourself when you want it.'
} else {
  Write-Step ''
  $wiring = Invoke-Native -FilePath $BinPath -Arguments @('install', '--version', $tagName)
  if (-not $wiring.Launched) {
    Write-Step "Could not run ``$BinPath install`` ($($wiring.Error)) — the binary is installed; run it yourself to finish wiring up Claude Code and Codex."
  }
}

Write-Step ''
Write-Step "Done. ongame-cli $tagName is installed at $BinPath."
