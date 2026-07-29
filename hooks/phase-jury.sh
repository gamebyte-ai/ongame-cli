#!/usr/bin/env bash
# phase-jury.sh — PostToolUse hook. Faz artifact'ı yazılınca ya da forge asset'leri diske materialize edilince (agent
# atlayamaz, CC runtime zorlar) core /hook/review'e POST eder, jüri feedback'ini additionalContext olarak agent'a
# enjekte eder. Jüri mantığı server'da (moat); bu hook ince tetikleyici. Her yolda exit 0 (build'i asla bloke etme).
# jq + curl gerekli; base64 (macOS/Linux ikisinde de standart) gerekli.
set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0
INPUT=$(cat)
TOOLNAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
CAP=200000            # text artifact cap (core readBody 4MB'ın çok altında; JSON escape payı için tampon)
IMG_CAP=400000        # tek görsel raw byte cap (~530KB base64) — üstündeki dosya SKIP edilir, ASLA truncate edilmez
                       # (binary bir dosyayı ortadan kesmek görüntüyü bozar; text'te olduğu gibi kısmi okuma güvenli değil)

# ── 1) ASSETS: forge asset'leri diske materialize edildiğinde (agent'ın assets_materialize ÇAĞIRMASI ZORUNLU — assets
#    diske BAŞKA yolla inmiyor, bu tool_input.gameDir'i doğrudan verir; dosya-yolu tahmini/whitelist gerekmez). ──
case "$TOOLNAME" in
  *assets_materialize)
    GAMEDIR=$(printf '%s' "$INPUT" | jq -r '.tool_input.gameDir // empty' 2>/dev/null)
    [ -z "$GAMEDIR" ] && exit 0
    JURY="$GAMEDIR/.ongame/jury.json"
    [ -f "$JURY" ] || exit 0     # provision yok (free tier / build başlamamış) → no-op, graceful
    PHASE=assets
    SRC="$GAMEDIR/assets/forge"
    [ -d "$SRC" ] || exit 0
    DB="$GAMEDIR/.ongame/.jury-$PHASE"
    NOW=$(date +%s)
    if [ -f "$DB" ]; then LAST=$(cat "$DB" 2>/dev/null || echo 0); [ $((NOW - LAST)) -lt 20 ] && exit 0; fi
    TOKEN=$(jq -r '.token // empty' "$JURY" 2>/dev/null)
    COREURL=$(jq -r '.coreUrl // empty' "$JURY" 2>/dev/null)
    BUILDID=$(jq -r '.buildId // empty' "$JURY" 2>/dev/null)
    { [ -z "$TOKEN" ] || [ -z "$COREURL" ] || [ -z "$BUILDID" ]; } && exit 0
    IMAGES="[]"
    COUNT=0
    while IFS= read -r -d '' f; do
      [ "$COUNT" -ge 3 ] && break
      SIZE=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
      [ -z "$SIZE" ] && continue
      [ "$SIZE" -gt "$IMG_CAP" ] && continue   # skip, NEVER truncate a binary file
      case "$f" in
        *.[pP][nN][gG]) MIME=image/png;;
        *.[jJ][pP][gG]|*.[jJ][pP][eE][gG]) MIME=image/jpeg;;
        *.[wW][eE][bB][pP]) MIME=image/webp;;
        *) continue;;
      esac
      B64=$(base64 < "$f" 2>/dev/null | tr -d '\n')
      [ -z "$B64" ] && continue
      IMAGES=$(printf '%s' "$IMAGES" | jq --arg m "$MIME" --arg b "$B64" '. + [{mimeType:$m, base64:$b}]' 2>/dev/null) || continue
      COUNT=$((COUNT + 1))
    done < <(find "$SRC" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) -print0 2>/dev/null)
    # Codex P2: only arm the debounce once an actual image was accepted — a materialize call with zero eligible images
    # (audio/glb-only, or every image oversized) must NOT poison the window and swallow the NEXT real image review.
    [ "$COUNT" -eq 0 ] && exit 0
    echo "$NOW" > "$DB" 2>/dev/null || true
    ARTIFACT="Generated game assets — review the attached image(s) for visual quality, style coherence, and readability."
    BODY=$(jq -n --arg b "$BUILDID" --arg p "$PHASE" --arg a "$ARTIFACT" --argjson imgs "$IMAGES" '{buildId:$b,phase:$p,artifact:$a,images:$imgs}')
    ;;

  *)
    # ── 2) TEXT / SCREENSHOT: Write|Edit|MultiEdit on a phase artifact, aggregated src/, or a polish screenshot. ──
    FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)
    [ -z "$FILE" ] && exit 0
    DIR=$(cd "$(dirname "$FILE")" 2>/dev/null && pwd) || exit 0
    ABSFILE="$DIR/$(basename "$FILE")"
    JURY=""
    SEARCH="$DIR"
    while [ -n "$SEARCH" ] && [ "$SEARCH" != "/" ]; do
      if [ -f "$SEARCH/.ongame/jury.json" ]; then JURY="$SEARCH/.ongame/jury.json"; break; fi
      SEARCH=$(dirname "$SEARCH")
    done
    [ -z "$JURY" ] && exit 0
    GAMEDIR=$(dirname "$(dirname "$JURY")")
    BASE=$(basename "$FILE")
    MODE=single
    case "$BASE" in
      CONCEPT.md) PHASE=concept;;
      RESEARCH.md) PHASE=research;;
      GAME_DESIGN.md) PHASE=docs;;
      levels.config.json) PHASE=levels;;
      *) case "$ABSFILE" in
           "$GAMEDIR"/src/*.ts|"$GAMEDIR"/src/*.js) PHASE=code; MODE=aggregate;;
           # best-effort polish screenshot (agent-cooperative, NOT hook-enforced — no bash-driven autonomous browser
           # capture exists; the polish skill instructs the agent to save one here via a browser tool).
           "$GAMEDIR"/.ongame/screenshots/*.[pP][nN][gG]|"$GAMEDIR"/.ongame/screenshots/*.[jJ][pP][gG]|"$GAMEDIR"/.ongame/screenshots/*.[jJ][pP][eE][gG]) PHASE=polish; MODE=screenshot;;
           *) exit 0;;
         esac;;
    esac
    DB="$GAMEDIR/.ongame/.jury-$PHASE"
    NOW=$(date +%s)
    if [ -f "$DB" ]; then LAST=$(cat "$DB" 2>/dev/null || echo 0); [ $((NOW - LAST)) -lt 20 ] && exit 0; fi
    echo "$NOW" > "$DB" 2>/dev/null || true
    TOKEN=$(jq -r '.token // empty' "$JURY" 2>/dev/null)
    COREURL=$(jq -r '.coreUrl // empty' "$JURY" 2>/dev/null)
    BUILDID=$(jq -r '.buildId // empty' "$JURY" 2>/dev/null)
    { [ -z "$TOKEN" ] || [ -z "$COREURL" ] || [ -z "$BUILDID" ]; } && exit 0

    if [ "$MODE" = "screenshot" ]; then
      SIZE=$(wc -c < "$ABSFILE" 2>/dev/null | tr -d ' ')
      { [ -z "$SIZE" ] || [ "$SIZE" -gt "$IMG_CAP" ]; } && exit 0   # skip oversized, never truncate a binary
      case "$ABSFILE" in
        *.[pP][nN][gG]) MIME=image/png;;
        *.[wW][eE][bB][pP]) MIME=image/webp;;
        *) MIME=image/jpeg;;
      esac
      B64=$(base64 < "$ABSFILE" 2>/dev/null | tr -d '\n')
      [ -z "$B64" ] && exit 0
      ARTIFACT="Screenshot of the current build — review the visible juice/polish quality."
      BODY=$(jq -n --arg b "$BUILDID" --arg p "$PHASE" --arg a "$ARTIFACT" --arg m "$MIME" --arg im "$B64" \
        '{buildId:$b,phase:$p,artifact:$a,images:[{mimeType:$m, base64:$im}]}')
    elif [ "$MODE" = "aggregate" ]; then
      # o ana kadar yazılmış TÜM src/**/*.{ts,js} — path-etiketli, toplam CAP byte'a kadar. NUL-safe baştan sona;
      # her dosya kalan bütçeye göre head -c ile okunuyor (tek okuma cap'i asla aşamaz).
      SRC="$GAMEDIR/src"
      [ -d "$SRC" ] || exit 0
      ARTIFACT=""
      while IFS= read -r -d '' f; do
        REMAIN=$((CAP - ${#ARTIFACT}))
        [ "$REMAIN" -le 0 ] && break
        REL="${f#"$GAMEDIR"/}"
        HEADER=$(printf '\n--- %s ---\n' "$REL")
        ARTIFACT="${ARTIFACT}${HEADER}"
        REMAIN=$((CAP - ${#ARTIFACT}))
        [ "$REMAIN" -le 0 ] && break
        CHUNK=$(head -c "$REMAIN" "$f" 2>/dev/null)
        ARTIFACT="${ARTIFACT}${CHUNK}"
      done < <(find "$SRC" -type f \( -name '*.ts' -o -name '*.js' \) -print0 2>/dev/null)
      [ -z "$ARTIFACT" ] && exit 0
      BODY=$(jq -n --arg b "$BUILDID" --arg p "$PHASE" --arg a "$ARTIFACT" '{buildId:$b,phase:$p,artifact:$a}')
    else
      ARTIFACT=$(head -c "$CAP" "$FILE" 2>/dev/null)
      [ -z "$ARTIFACT" ] && exit 0
      BODY=$(jq -n --arg b "$BUILDID" --arg p "$PHASE" --arg a "$ARTIFACT" '{buildId:$b,phase:$p,artifact:$a}')
    fi
    ;;
esac

# Codex P1: a 2-3 image BODY (~1MB+ base64) as a curl ARGV can exceed the OS arg-list limit ("argument list too long")
# → curl exec fails → RESP silently empty → the visual review is dropped. Pipe via stdin instead (--data-binary @-),
# never exec-argv, no size ceiling from the shell/OS side.
RESP=$(printf '%s' "$BODY" | curl -s --max-time 40 -X POST "$COREURL/hook/review" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data-binary @- 2>/dev/null)
[ -z "$RESP" ] && exit 0
VERDICT=$(printf '%s' "$RESP" | jq -r '.verdict // "skip"' 2>/dev/null)
FEEDBACK=$(printf '%s' "$RESP" | jq -r '[.feedback[]?.issue] | join(" · ")' 2>/dev/null)
STRENGTHS=$(printf '%s' "$RESP" | jq -r '[.strengths[]?.issue] | join(" · ")' 2>/dev/null)
if [ "$VERDICT" = "revise" ]; then
  MSG="⚠️ Faz kalite jürisi ($PHASE) — EKSİ (revizyon önerisi): ${FEEDBACK}."
  [ -n "$STRENGTHS" ] && MSG="${MSG} ARTI (koru): ${STRENGTHS}."
  MSG="${MSG} Her maddeyi UYGULAMADAN ÖNCE kısa DOĞRULA: madde geçerli + bu oyunun bağlamına/intent'ine uygun mu? Öyleyse düzelt; yanlış, alakasız ya da false-positive ise tek cümlelik gerekçeyle geç (körlemesine uygulama). Kullanıcı jüriyi görmezden gel demediyse default: ciddiye al."
  jq -n --arg c "$MSG" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
elif [ -n "$STRENGTHS" ]; then
  MSG="✅ Faz kalite jürisi ($PHASE) geçti. Öne çıkanlar (ARTI): ${STRENGTHS}. Bilgi amaçlı — aksiyon gerekmez."
  jq -n --arg c "$MSG" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
fi
exit 0
