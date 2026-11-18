/** git diff(unified=0) 결과를 파일별 추가·삭제 줄로 나눈다. */
export interface DiffLine {
  /** 추가된 줄은 새 파일 기준, 삭제된 줄은 이전 파일 기준 줄 번호 */
  line: number;
  text: string;
}

export interface FileDiff {
  path: string;
  added: DiffLine[];
  removed: DiffLine[];
}

export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      // diff --git a/<경로> b/<경로>
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
      current = { path: match?.[2] ?? match?.[1] ?? raw, added: [], removed: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith('+++ ')) {
      if (raw !== '+++ /dev/null') current.path = raw.replace(/^\+\+\+ b\//, '');
      continue;
    }
    if (raw.startsWith('--- ')) {
      if (raw !== '--- /dev/null' && current.path === '/dev/null') current.path = raw.replace(/^--- a\//, '');
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (raw.startsWith('+')) {
      current.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      current.removed.push({ line: oldLine, text: raw.slice(1) });
      oldLine += 1;
    } else if (raw.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return files;
}
