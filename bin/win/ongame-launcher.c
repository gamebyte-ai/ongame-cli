/*
 * ongame-launcher.exe — the Windows twin of `bin/ongame-launcher` (POSIX sh).
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * `.claude-plugin/plugin.json` and `hooks/hooks.json` point Claude Code at
 * `${CLAUDE_PLUGIN_ROOT}/bin/ongame-launcher` — one command string, every platform. A plugin
 * manifest has no per-OS conditional (verified: the plugin reference documents only
 * command/args/env), so the single string has to resolve to something runnable on Windows too.
 * It does, because Windows spawn resolution appends executable extensions: MEASURED on a
 * windows-latest runner, an extensionless absolute path resolves to its `.exe` sibling under BOTH
 * Node's built-in spawn (libuv) and cross-spawn (what the MCP SDK uses) — and it still wins with
 * the POSIX `ongame-launcher` sh script sitting right beside it. `.cmd` was measured to FAIL under
 * raw spawn, which is why this is a real PE executable and not a batch shim.
 *
 * All it does is hand off to the real, self-updating CLI at
 * `%ONGAME_INSTALL_DIR%\bin\ongame-cli.exe` (default `%USERPROFILE%\.ongame\bin\ongame-cli.exe`).
 * Every piece of actual logic — self-update, the MCP server, the hooks — lives there, so this file
 * is meant to essentially never change again. That is the whole point of the split: Claude Code
 * only re-reads plugin.json at session start, so plugin.json (and therefore this trampoline) must
 * stay still while the CLI behind it updates freely.
 *
 * HARD RULES
 * ----------
 *  - NEVER write to stdout. Once we hand off, stdout is the JSON-RPC channel; a single stray byte
 *    from this process corrupts the protocol. All diagnostics go to stderr.
 *  - Pass the child's command line through VERBATIM. We deliberately do not parse or re-quote argv:
 *    re-quoting is where argument corruption lives, and Claude Code's exec-form hooks pass argument
 *    vectors that must arrive intact.
 *  - Kill-on-close. Windows does not cascade process termination: if Claude Code kills this
 *    trampoline, a 115 MB ongame-cli.exe would be orphaned and keep holding its stdio pipes. A Job
 *    Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE makes the child die with us. (The POSIX twin
 *    gets this for free — `exec` replaces the process image, so there is no second process at all.)
 *
 * Built by .github/workflows/trampoline.yml with MSVC and committed as `bin/ongame-launcher.exe`
 * (~50 KB). That workflow rebuilds from this source on every change to `bin/` and fails if the
 * committed artifact no longer matches, so the blob can never silently drift from the code.
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

/*
 * Writes to stderr without pulling in the C runtime's stdio.
 *
 * WriteFile + an explicit UTF-8 conversion, NOT WriteConsoleW: WriteConsoleW only works when the
 * handle is a real console. Claude Code hands this process a PIPE for stderr, which is precisely
 * the case that matters — with WriteConsoleW every diagnostic here would silently vanish exactly
 * when someone needed to read it. WriteFile works for a console, a pipe and a redirected file
 * alike.
 */
static void err(const wchar_t *s) {
    char utf8[1024];
    DWORD written;
    int n;
    HANDLE h = GetStdHandle(STD_ERROR_HANDLE);
    if (h == INVALID_HANDLE_VALUE || h == NULL) return;
    n = WideCharToMultiByte(CP_UTF8, 0, s, -1, utf8, (int)sizeof(utf8), NULL, NULL);
    if (n <= 1) return; /* n includes the NUL terminator */
    WriteFile(h, utf8, (DWORD)(n - 1), &written, NULL);
}

/*
 * The child's command line must be `"<binary>" <our own arguments verbatim>`.
 *
 * GetCommandLineW() hands back the whole line INCLUDING argv[0], so we skip exactly one token to
 * find where our arguments start. argv[0] is either a quoted string (then it ends at the closing
 * quote) or an unquoted run of non-space characters — the same two cases the Windows command-line
 * parser itself recognizes. Everything after that point is copied through untouched.
 */
static const wchar_t *args_after_argv0(const wchar_t *cmdline) {
    const wchar_t *p = cmdline;
    while (*p == L' ' || *p == L'\t') p++;
    if (*p == L'"') {
        p++;
        while (*p && *p != L'"') p++;
        if (*p == L'"') p++;
    } else {
        while (*p && *p != L' ' && *p != L'\t') p++;
    }
    while (*p == L' ' || *p == L'\t') p++;
    return p;
}

static void append(wchar_t *dst, size_t cap, size_t *len, const wchar_t *src) {
    while (*src && *len + 1 < cap) dst[(*len)++] = *src++;
    dst[*len] = L'\0';
}

int wmain(void) {
    wchar_t binPath[MAX_PATH * 2];
    size_t n = 0;
    wchar_t installDir[MAX_PATH * 2];

    /*
     * `ONGAME_INSTALL_DIR` mirrors the POSIX launcher's own override (used by install.sh/install.ps1
     * and by the test harness); `%USERPROFILE%` is the default root. USERPROFILE, not HOMEDRIVE +
     * HOMEPATH: on a domain-joined machine those can point at a network share the user profile does
     * not actually live on.
     */
    binPath[0] = L'\0';
    if (GetEnvironmentVariableW(L"ONGAME_INSTALL_DIR", installDir, MAX_PATH * 2) > 0) {
        append(binPath, MAX_PATH * 2, &n, installDir);
        append(binPath, MAX_PATH * 2, &n, L"\\bin\\ongame-cli.exe");
    } else if (GetEnvironmentVariableW(L"USERPROFILE", installDir, MAX_PATH * 2) > 0) {
        append(binPath, MAX_PATH * 2, &n, installDir);
        append(binPath, MAX_PATH * 2, &n, L"\\.ongame\\bin\\ongame-cli.exe");
    } else {
        err(L"[ongame-launcher] USERPROFILE is not set - cannot locate the ongame install directory.\n");
        return 1;
    }

    /*
     * The CLI's own self-update renames the running binary aside and moves the new one in. There is
     * a sub-millisecond window where the target path does not exist; a hook firing at exactly that
     * instant would otherwise report "not installed" and send the user to reinstall for no reason.
     * One short retry closes it. A genuinely missing install still fails after ~300 ms.
     */
    if (GetFileAttributesW(binPath) == INVALID_FILE_ATTRIBUTES) {
        Sleep(300);
        if (GetFileAttributesW(binPath) == INVALID_FILE_ATTRIBUTES) {
            err(L"[ongame-launcher] ongame-cli is not installed.\n");
            err(L"[ongame-launcher] Run this to install it:  irm https://cli.ongame.ai/install.ps1 | iex\n");
            return 1;
        }
    }

    {
        wchar_t cmd[32768]; /* the documented maximum command-line length */
        size_t c = 0;
        HANDLE job;
        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        DWORD code = 1;

        append(cmd, 32768, &c, L"\"");
        append(cmd, 32768, &c, binPath);
        append(cmd, 32768, &c, L"\" ");
        append(cmd, 32768, &c, args_after_argv0(GetCommandLineW()));

        /*
         * Create the job BEFORE the child so there is no window in which the child exists outside
         * it. The child is created suspended, assigned, then resumed — the standard race-free order.
         * If any of this fails we still run the child unjobbed rather than refusing to start: a
         * possible orphan is far better than a plugin that does not work at all.
         */
        job = CreateJobObjectW(NULL, NULL);
        if (job) {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION jeli;
            ZeroMemory(&jeli, sizeof(jeli));
            jeli.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(job, JobObjectExtendedLimitInformation, &jeli, sizeof(jeli));
        }

        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        ZeroMemory(&pi, sizeof(pi));

        /*
         * bInheritHandles = TRUE is what makes the stdio handoff transparent: the child inherits our
         * stdin/stdout/stderr directly, so the JSON-RPC stream flows between Claude Code and the CLI
         * with this process merely waiting in between.
         */
        if (!CreateProcessW(binPath, cmd, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &si, &pi)) {
            err(L"[ongame-launcher] failed to start ongame-cli.exe\n");
            if (job) CloseHandle(job);
            return 1;
        }

        if (job) AssignProcessToJobObject(job, pi.hProcess);
        ResumeThread(pi.hThread);

        WaitForSingleObject(pi.hProcess, INFINITE);
        GetExitCodeProcess(pi.hProcess, &code);

        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        /*
         * Closing the job here would kill the child — but the child has already exited, so this is
         * just cleanup. Letting the handle close on process exit has the same effect.
         */
        if (job) CloseHandle(job);
        return (int)code;
    }
}
