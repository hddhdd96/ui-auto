// Mock 클라우드 포털 콘솔. 빌드 없이 브라우저에서 바로 실행하는 바닐라 JS.
// 화면 요소는 label, role, 접근 가능한 이름을 갖도록 만들어 getByRole/getByLabel로 찾을 수 있게 한다.

const REFRESH_INTERVAL_MS = 1000;
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

const state = {
  me: null,
  projectId: localStorage.getItem('projectId') ?? '',
  flavors: [],
  /** 현재 화면의 목록을 다시 불러오는 함수. 자동 갱신 타이머가 부른다. */
  refresh: null,
};

const $ = (selector) => document.querySelector(selector);

/** DOM 요소를 만든다. 사용자 입력은 항상 텍스트 노드로 넣는다. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// ---------- API ----------

function tokenFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)portal_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function api(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const token = tokenFromCookie();
  if (token) headers.authorization = `Bearer ${token}`;
  if (state.projectId) headers['x-project-id'] = state.projectId;
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error?.message ?? `요청에 실패했습니다 (HTTP ${res.status}).`);
    error.status = res.status;
    error.code = data?.error?.code;
    if (res.status === 401 && path !== '/auth/login') showLogin(error.message);
    throw error;
  }
  return data;
}

// ---------- 공통 UI ----------

function showMessage(text) {
  $('#error').hidden = true;
  $('#message').textContent = text;
  $('#message').hidden = false;
}

function showError(text) {
  $('#message').hidden = true;
  $('#error').textContent = text;
  $('#error').hidden = false;
}

function clearAlerts() {
  $('#message').hidden = true;
  $('#error').hidden = true;
}

const statusBadge = (status) => h('span', { class: 'status', 'data-status': status }, status);

function field(label, control) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control);
}

function select(options, attrs = {}) {
  return h('select', attrs, options.map((o) => h('option', { value: o.value }, o.label)));
}

/** 이름 규칙은 서버와 같다: 3~30자, 영문 소문자로 시작, 영문 소문자·숫자·하이픈. */
function nameError(name) {
  if (!name) return '이름은 필수입니다.';
  if (name.length < 3 || name.length > 30) return '이름은 3~30자여야 합니다.';
  if (!NAME_PATTERN.test(name)) return '이름은 영문 소문자로 시작하고 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.';
  return null;
}

/** 쿼터를 넘는 항목이 있으면 화면에서 먼저 생성을 막는다. */
async function quotaError(delta) {
  const { usage, quota } = await api('GET', '/usage');
  const over = Object.keys(delta).filter((key) => usage[key] + delta[key] > quota[key]);
  return over.length > 0 ? `쿼터를 초과해서 만들 수 없습니다: ${over.join(', ')}` : null;
}

/**
 * 공용 대화상자를 연다. onSubmit이 오류를 던지면 대화상자 안에 보여주고 닫지 않는다.
 */
function openDialog({ title, body = [], okLabel = '확인', onSubmit }) {
  const dialog = $('#dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-body').replaceChildren(...[body].flat());
  $('#dialog-ok').textContent = okLabel;
  $('#dialog-error').hidden = true;
  $('#dialog-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await onSubmit();
      dialog.close();
    } catch (error) {
      $('#dialog-error').textContent = error.message;
      $('#dialog-error').hidden = false;
    }
  };
  $('#dialog-cancel').onclick = () => dialog.close();
  dialog.showModal();
}

// 닫힌 대화상자에 이전 내용이 남아 있지 않게 비운다.
$('#dialog').addEventListener('close', () => {
  $('#dialog-title').textContent = '';
  $('#dialog-body').replaceChildren();
});

function confirmDelete(kind, item, path) {
  openDialog({
    title: `${kind} 삭제`,
    body: h('p', {}, `${item.name}을(를) 삭제할까요?`),
    okLabel: '삭제',
    onSubmit: async () => {
      await api('DELETE', path);
      showMessage(`${item.name} 삭제를 요청했습니다.`);
      await state.refresh?.();
    },
  });
}

/**
 * 목록 표를 그린다. 데이터가 바뀌었을 때만 다시 그려서, 자동 갱신 중에도 버튼이 불필요하게 교체되지 않게 한다.
 */
function createTable(caption, columns) {
  const tbody = h('tbody');
  const table = h('table', {},
    h('caption', {}, caption),
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col' }, c.header)))),
    tbody,
  );
  let lastJson = null;
  function update(rows, context) {
    const json = JSON.stringify([rows, context]);
    if (json === lastJson) return;
    lastJson = json;
    tbody.replaceChildren(...(rows.length === 0
      ? [h('tr', {}, h('td', { colspan: columns.length }, '항목이 없습니다.'))]
      : rows.map((row) => h('tr', {}, columns.map((c) =>
        h('td', { class: c.actions ? 'actions' : undefined }, c.cell(row, context)))))));
  }
  return { element: table, update };
}

/** 생성 폼 패널. 제출 중 오류는 화면 위쪽 알림 영역에 보여준다. */
function createForm(title, fields, submitLabel, onSubmit) {
  // 브라우저 기본 검증 말풍선 대신 포털의 오류 메시지로 통일하기 위해 novalidate를 붙인다.
  const form = h('form', { class: 'form-row', 'aria-label': title, novalidate: true }, fields, h('button', { type: 'submit' }, submitLabel));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlerts();
    try {
      const done = await onSubmit();
      if (done === false) return;
      form.reset();
      await state.refresh?.();
    } catch (error) {
      if (error.status !== 401) showError(error.message);
    }
  });
  return h('section', { class: 'panel' }, h('h2', {}, title), form);
}

const isAdmin = () => state.me?.role === 'admin';

// ---------- 화면: 대시보드 ----------

const USAGE_LABELS = {
  instances: '인스턴스 수', vcpus: 'vCPU', ramGb: '메모리(GB)', volumes: '볼륨 수',
  volumeGb: '볼륨 용량(GB)', volumeGroups: '볼륨 그룹 수', networks: '네트워크 수', securityGroups: '보안 그룹 수',
};

async function dashboardView(view) {
  const table = createTable('프로젝트 사용량', [
    { header: '항목', cell: (r) => r.label },
    { header: '사용량', cell: (r) => h('span', { class: r.used > r.limit ? 'over' : undefined }, r.used) },
    { header: '쿼터', cell: (r) => r.limit },
    { header: '사용률', cell: (r) => h('progress', { max: Math.max(r.limit, 1), value: Math.min(r.used, r.limit), 'aria-label': `${r.label} 사용률` }) },
  ]);
  view.append(h('h1', {}, '대시보드'), h('section', { class: 'panel' }, table.element));

  if (isAdmin()) {
    const inputs = Object.fromEntries(Object.entries(USAGE_LABELS).map(([key, label]) =>
      [key, h('input', { type: 'number', min: 0, style: 'width: 110px', 'data-key': key })]));
    view.append(createForm('쿼터 변경', Object.entries(USAGE_LABELS).map(([key, label]) => field(label, inputs[key])), '쿼터 저장',
      async () => {
        const body = {};
        for (const [key, input] of Object.entries(inputs)) if (input.value !== '') body[key] = Number(input.value);
        await api('PUT', '/quota', body);
        showMessage('쿼터를 저장했습니다.');
      }));
  }

  state.refresh = async () => {
    const { usage, quota } = await api('GET', '/usage');
    table.update(Object.entries(USAGE_LABELS).map(([key, label]) => ({ label, used: usage[key], limit: quota[key] })));
  };
}

// ---------- 화면: 인스턴스 ----------

async function instancesView(view) {
  const [networks, securityGroups] = await Promise.all([api('GET', '/networks'), api('GET', '/security-groups')]);
  const flavorName = (id) => state.flavors.find((f) => f.id === id)?.name ?? id;

  const name = h('input', { name: 'name' });
  const flavor = select(state.flavors.map((f) => ({ value: f.id, label: f.name })));
  const network = select(networks.map((n) => ({ value: n.id, label: `${n.name} (${n.cidr})` })));
  const sgBoxes = securityGroups.map((g) => h('label', {}, h('input', { type: 'checkbox', value: g.id }), ` ${g.name}`));

  const table = createTable('인스턴스 목록', [
    { header: '이름', cell: (r) => r.name },
    { header: '상태', cell: (r) => [statusBadge(r.status), r.fault ? h('div', {}, r.fault) : null] },
    { header: '사양', cell: (r) => flavorName(r.flavorId) },
    { header: '네트워크', cell: (r, ctx) => ctx.networks[r.networkId] ?? r.networkId },
    { header: '연결된 볼륨', cell: (r, ctx) => ctx.volumes.filter((v) => v.attachedInstanceId === r.id).map((v) => v.name).join(', ') || '-' },
    {
      header: '작업', actions: true, cell: (r) => [
        h('button', { type: 'button', 'aria-label': `${r.name} 사양 변경`, disabled: r.status !== 'ACTIVE', onclick: () => resizeDialog(r) }, '사양 변경'),
        h('button', { type: 'button', class: 'danger', 'aria-label': `${r.name} 삭제`, onclick: () => confirmDelete('인스턴스', r, `/instances/${r.id}`) }, '삭제'),
      ],
    },
  ]);

  function resizeDialog(instance) {
    const next = select(state.flavors.map((f) => ({ value: f.id, label: f.name })));
    next.value = instance.flavorId;
    openDialog({
      title: `${instance.name} 사양 변경`,
      body: field('새 사양', next),
      okLabel: '변경',
      onSubmit: async () => {
        await api('POST', `/instances/${instance.id}/resize`, { flavorId: next.value });
        showMessage(`${instance.name} 사양 변경을 요청했습니다.`);
        await state.refresh?.();
      },
    });
  }

  view.append(
    h('h1', {}, '인스턴스'),
    createForm('인스턴스 생성', [
      field('이름', name), field('사양', flavor), field('네트워크', network),
      h('fieldset', {}, h('legend', {}, '보안 그룹'), sgBoxes),
    ], '인스턴스 생성', async () => {
      const invalid = nameError(name.value);
      if (invalid) { showError(invalid); return false; }
      const chosen = state.flavors.find((f) => f.id === flavor.value);
      const blocked = await quotaError({ instances: 1, vcpus: chosen.vcpus, ramGb: chosen.ramGb });
      if (blocked) { showError(blocked); return false; }
      await api('POST', '/instances', {
        name: name.value, flavorId: flavor.value, networkId: network.value,
        securityGroupIds: sgBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
      });
      showMessage(`${name.value} 생성을 요청했습니다.`);
    }),
    h('section', { class: 'panel' }, table.element),
  );

  state.refresh = async () => {
    const [instances, volumes] = await Promise.all([api('GET', '/instances'), api('GET', '/volumes')]);
    table.update(instances, { volumes, networks: Object.fromEntries(networks.map((n) => [n.id, n.name])) });
  };
}

// ---------- 화면: 볼륨 ----------

async function volumesView(view) {
  const name = h('input', { name: 'name' });
  const size = h('input', { name: 'sizeGb', type: 'number', style: 'width: 110px' });

  const table = createTable('볼륨 목록', [
    { header: '이름', cell: (r) => r.name },
    { header: '상태', cell: (r) => statusBadge(r.status) },
    { header: '크기(GB)', cell: (r) => r.sizeGb },
    { header: '연결된 인스턴스', cell: (r, ctx) => ctx.instances[r.attachedInstanceId] ?? '-' },
    { header: '볼륨 그룹', cell: (r, ctx) => ctx.groups[r.groupId] ?? '-' },
    {
      header: '작업', actions: true, cell: (r) => [
        r.status === 'IN_USE'
          ? h('button', { type: 'button', 'aria-label': `${r.name} 분리`, onclick: () => detach(r) }, '분리')
          : h('button', { type: 'button', 'aria-label': `${r.name} 연결`, disabled: r.status !== 'AVAILABLE', onclick: () => attachDialog(r) }, '연결'),
        h('button', { type: 'button', class: 'danger', 'aria-label': `${r.name} 삭제`, onclick: () => confirmDelete('볼륨', r, `/volumes/${r.id}`) }, '삭제'),
      ],
    },
  ]);

  async function attachDialog(volume) {
    const instances = (await api('GET', '/instances')).filter((i) => i.status === 'ACTIVE');
    const target = select(instances.map((i) => ({ value: i.id, label: i.name })));
    openDialog({
      title: `${volume.name} 연결`,
      body: instances.length > 0 ? field('연결할 인스턴스', target) : h('p', {}, '연결할 수 있는 ACTIVE 인스턴스가 없습니다.'),
      okLabel: '연결',
      onSubmit: async () => {
        await api('POST', `/volumes/${volume.id}/attach`, { instanceId: target.value });
        showMessage(`${volume.name} 연결을 요청했습니다.`);
        await state.refresh?.();
      },
    });
  }

  async function detach(volume) {
    clearAlerts();
    try {
      await api('POST', `/volumes/${volume.id}/detach`);
      showMessage(`${volume.name} 분리를 요청했습니다.`);
      await state.refresh?.();
    } catch (error) {
      if (error.status !== 401) showError(error.message);
    }
  }

  view.append(
    h('h1', {}, '볼륨'),
    createForm('볼륨 생성', [field('이름', name), field('크기(GB)', size)], '볼륨 생성', async () => {
      const invalid = nameError(name.value);
      if (invalid) { showError(invalid); return false; }
      const sizeGb = Number(size.value);
      if (size.value === '' || !Number.isInteger(sizeGb) || sizeGb < 1 || sizeGb > 1000) {
        showError('크기는 1~1000 GB 범위의 정수여야 합니다.');
        return false;
      }
      const blocked = await quotaError({ volumes: 1, volumeGb: sizeGb });
      if (blocked) { showError(blocked); return false; }
      await api('POST', '/volumes', { name: name.value, sizeGb });
      showMessage(`${name.value} 생성을 요청했습니다.`);
    }),
    h('section', { class: 'panel' }, table.element),
  );

  state.refresh = async () => {
    const [volumes, instances, groups] = await Promise.all([
      api('GET', '/volumes'), api('GET', '/instances'), api('GET', '/volume-groups'),
    ]);
    table.update(volumes, {
      instances: Object.fromEntries(instances.map((i) => [i.id, i.name])),
      groups: Object.fromEntries(groups.map((g) => [g.id, g.name])),
    });
  };
}

// ---------- 화면: 볼륨 그룹 ----------

async function volumeGroupsView(view) {
  const name = h('input', { name: 'name' });
  const candidates = (await api('GET', '/volumes')).filter((v) => !v.groupId && (v.status === 'AVAILABLE' || v.status === 'IN_USE'));
  const boxes = candidates.map((v) => h('label', {}, h('input', { type: 'checkbox', value: v.id }), ` ${v.name}`));

  const table = createTable('볼륨 그룹 목록', [
    { header: '이름', cell: (r) => r.name },
    { header: '상태', cell: (r) => statusBadge(r.status) },
    { header: '볼륨', cell: (r, ctx) => r.volumeIds.map((id) => ctx.volumes[id] ?? id).join(', ') },
    {
      header: '작업', actions: true, cell: (r) =>
        h('button', { type: 'button', class: 'danger', 'aria-label': `${r.name} 삭제`, onclick: () => confirmDelete('볼륨 그룹', r, `/volume-groups/${r.id}`) }, '삭제'),
    },
  ]);

  view.append(
    h('h1', {}, '볼륨 그룹'),
    createForm('볼륨 그룹 생성', [
      field('이름', name),
      h('fieldset', {}, h('legend', {}, '볼륨'), boxes.length > 0 ? boxes : '묶을 수 있는 볼륨이 없습니다.'),
    ], '볼륨 그룹 생성', async () => {
      const invalid = nameError(name.value);
      if (invalid) { showError(invalid); return false; }
      const volumeIds = boxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
      if (volumeIds.length === 0) { showError('볼륨을 1개 이상 골라야 합니다.'); return false; }
      await api('POST', '/volume-groups', { name: name.value, volumeIds });
      showMessage(`${name.value} 생성을 요청했습니다.`);
    }),
    h('section', { class: 'panel' }, table.element),
  );

  state.refresh = async () => {
    const [groups, volumes] = await Promise.all([api('GET', '/volume-groups'), api('GET', '/volumes')]);
    table.update(groups, { volumes: Object.fromEntries(volumes.map((v) => [v.id, v.name])) });
  };
}

// ---------- 화면: 네트워크 ----------

async function networksView(view) {
  const name = h('input', { name: 'name' });
  const cidr = h('input', { name: 'cidr', placeholder: '10.1.0.0/16' });

  const table = createTable('네트워크 목록', [
    { header: '이름', cell: (r) => r.name },
    { header: 'IP 대역', cell: (r) => r.cidr },
    { header: '서브넷', cell: (r) => r.subnets.map((s) => `${s.name} (${s.cidr})`).join(', ') || '-' },
    {
      header: '작업', actions: true, cell: (r) => isAdmin() ? [
        h('button', { type: 'button', 'aria-label': `${r.name} 서브넷 추가`, onclick: () => subnetDialog(r) }, '서브넷 추가'),
        h('button', { type: 'button', class: 'danger', 'aria-label': `${r.name} 삭제`, onclick: () => confirmDelete('네트워크', r, `/networks/${r.id}`) }, '삭제'),
      ] : '-',
    },
  ]);

  function subnetDialog(network) {
    const subnetName = h('input', {});
    const subnetCidr = h('input', { placeholder: '10.1.1.0/24' });
    openDialog({
      title: `${network.name} 서브넷 추가`,
      body: [field('서브넷 이름', subnetName), field('서브넷 IP 대역', subnetCidr)],
      okLabel: '추가',
      onSubmit: async () => {
        const invalid = nameError(subnetName.value);
        if (invalid) throw new Error(invalid);
        await api('POST', `/networks/${network.id}/subnets`, { name: subnetName.value, cidr: subnetCidr.value });
        showMessage(`${subnetName.value} 서브넷을 추가했습니다.`);
        await state.refresh?.();
      },
    });
  }

  view.append(h('h1', {}, '네트워크'));
  if (isAdmin()) {
    view.append(createForm('네트워크 생성', [field('이름', name), field('IP 대역', cidr)], '네트워크 생성', async () => {
      const invalid = nameError(name.value);
      if (invalid) { showError(invalid); return false; }
      await api('POST', '/networks', { name: name.value, cidr: cidr.value });
      showMessage(`${name.value} 네트워크를 만들었습니다.`);
    }));
  } else {
    view.append(h('p', { class: 'panel' }, '네트워크 생성과 삭제는 관리자만 할 수 있습니다.'));
  }
  view.append(h('section', { class: 'panel' }, table.element));

  state.refresh = async () => { table.update(await api('GET', '/networks')); };
}

// ---------- 화면: 보안 그룹 ----------

async function securityGroupsView(view) {
  const name = h('input', { name: 'name' });
  const description = h('input', { name: 'description' });
  const direction = select([{ value: 'ingress', label: '인바운드' }, { value: 'egress', label: '아웃바운드' }]);
  const protocol = select([{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }, { value: 'icmp', label: 'ICMP' }]);
  const port = h('input', { type: 'number', style: 'width: 90px' });
  const ruleCidr = h('input', { placeholder: '0.0.0.0/0' });
  const directionLabel = { ingress: '인바운드', egress: '아웃바운드' };

  const table = createTable('보안 그룹 목록', [
    { header: '이름', cell: (r) => r.name },
    { header: '설명', cell: (r) => r.description || '-' },
    { header: '규칙', cell: (r) => r.rules.map((x) => `${directionLabel[x.direction]} ${x.protocol.toUpperCase()} ${x.port ?? '전체'} ${x.cidr}`).join(', ') || '-' },
    {
      header: '작업', actions: true, cell: (r) =>
        h('button', { type: 'button', class: 'danger', 'aria-label': `${r.name} 삭제`, onclick: () => confirmDelete('보안 그룹', r, `/security-groups/${r.id}`) }, '삭제'),
    },
  ]);

  view.append(
    h('h1', {}, '보안 그룹'),
    createForm('보안 그룹 생성', [
      field('이름', name), field('설명', description),
      h('fieldset', { class: 'form-row' }, h('legend', {}, '규칙(선택)'),
        field('방향', direction), field('프로토콜', protocol), field('포트', port), field('허용 IP 대역', ruleCidr)),
    ], '보안 그룹 생성', async () => {
      const invalid = nameError(name.value);
      if (invalid) { showError(invalid); return false; }
      const rules = ruleCidr.value === '' ? [] : [{
        direction: direction.value, protocol: protocol.value,
        port: port.value === '' ? null : Number(port.value), cidr: ruleCidr.value,
      }];
      await api('POST', '/security-groups', { name: name.value, description: description.value, rules });
      showMessage(`${name.value} 보안 그룹을 만들었습니다.`);
    }),
    h('section', { class: 'panel' }, table.element),
  );

  state.refresh = async () => { table.update(await api('GET', '/security-groups')); };
}

// ---------- 라우팅 ----------

const ROUTES = {
  '#/dashboard': dashboardView,
  '#/instances': instancesView,
  '#/volumes': volumesView,
  '#/volume-groups': volumeGroupsView,
  '#/networks': networksView,
  '#/security-groups': securityGroupsView,
};

/** 메뉴를 누를 때마다 화면을 처음부터 다시 그리고 최신 데이터를 불러온다. */
async function navigate() {
  if (!state.me) return;
  const hash = ROUTES[location.hash] ? location.hash : '#/dashboard';
  for (const link of document.querySelectorAll('nav a')) {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  clearAlerts();
  state.refresh = null;
  const view = $('#view');
  view.replaceChildren();
  try {
    await ROUTES[hash](view);
    await state.refresh?.();
  } catch (error) {
    if (error.status !== 401) showError(error.message);
  }
}

setInterval(async () => {
  if (!state.me || !state.refresh) return;
  try {
    await state.refresh();
  } catch {
    // 자동 갱신 실패는 다음 주기에 다시 시도한다. 401이면 api()가 로그인 화면으로 보낸다.
  }
}, REFRESH_INTERVAL_MS);

// ---------- 로그인·세션 ----------

function showLogin(message) {
  state.me = null;
  state.refresh = null;
  if ($('#dialog').open) $('#dialog').close();
  $('#console-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-error').textContent = message ?? '';
  $('#login-error').hidden = !message;
}

function showExpiry(expiresAt) {
  $('#session-expiry').textContent = `세션 만료 ${new Date(expiresAt).toLocaleTimeString('ko-KR', { hour12: false })}`;
}

async function enterConsole() {
  const me = await api('GET', '/auth/me');
  const projects = await api('GET', '/projects');
  state.flavors = await api('GET', '/flavors');
  state.projectId = me.projectId;
  localStorage.setItem('projectId', state.projectId);
  state.me = me.user;

  const projectSelect = $('#project-select');
  projectSelect.replaceChildren(...projects.map((p) => h('option', { value: p.id }, p.name)));
  projectSelect.value = state.projectId;
  $('#user-name').textContent = `${me.user.displayName} (${me.user.role === 'admin' ? '관리자' : '일반 사용자'})`;
  showExpiry(me.expiresAt);

  $('#login-view').hidden = true;
  $('#console-view').hidden = false;
  await navigate();
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    state.projectId = '';
    await api('POST', '/auth/login', { username: form.get('username'), password: form.get('password') });
    event.target.reset();
    await enterConsole();
  } catch (error) {
    showLogin(error.message);
  }
});

$('#project-select').addEventListener('change', async (event) => {
  state.projectId = event.target.value;
  localStorage.setItem('projectId', state.projectId);
  await navigate();
});

$('#extend-button').addEventListener('click', async () => {
  try {
    const { expiresAt } = await api('POST', '/auth/extend');
    showExpiry(expiresAt);
    showMessage('세션을 연장했습니다.');
  } catch (error) {
    if (error.status !== 401) showError(error.message);
  }
});

$('#logout-button').addEventListener('click', async () => {
  try {
    await api('POST', '/auth/logout');
  } finally {
    showLogin();
  }
});

window.addEventListener('hashchange', navigate);

// 시작: 쿠키에 유효한 토큰이 있으면 콘솔로, 없으면 로그인 화면으로 간다.
if (tokenFromCookie()) {
  enterConsole().catch(() => showLogin());
} else {
  showLogin();
}
