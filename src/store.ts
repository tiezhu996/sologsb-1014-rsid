import { redraw } from 'mithril';
import type { ProofCheck, ProofDocument, ProofStep, ProofVersion } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v1';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论'];

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: ['i1'], note: '归纳基例。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i3'], note: '尚未补齐归纳假设。', counterexample: '', alternative: '' },
  ];
}

function initialDocuments(): ProofDocument[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'doc-algebra',
      title: '完全平方公式证明',
      author: '数学组',
      goal: '$(a+b)^2=a^2+2ab+b^2$',
      symbols: { a: '实数', b: '实数', P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: sampleSteps(),
      versions: [],
      updatedAt: now,
    },
    {
      id: 'doc-induction',
      title: '数学归纳法待核对稿',
      author: '学生工作区',
      goal: '$P(n)$ 对所有正整数 $n$ 成立',
      symbols: { P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: issueSteps(),
      versions: [],
      updatedAt: now,
    },
  ];
}

function loadDocuments(): ProofDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDocuments();
    const parsed = JSON.parse(raw) as ProofDocument[];
    return Array.isArray(parsed) && parsed.length ? parsed : initialDocuments();
  } catch {
    return initialDocuments();
  }
}

export class ProofStore {
  documents = loadDocuments();
  activeId = this.documents[0]?.id ?? '';
  selectedStepId = this.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: ProofDocument[][] = [];
  redoStack: ProofDocument[][] = [];
  toast = '';

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    if (!this.current) return [];
    return validate(this.current);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.documents));
  }

  update(mutator: (document: ProofDocument) => void): void {
    this.undoStack.push(clone(this.documents));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.current);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.documents));
    this.documents = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.documents));
    this.documents = next;
    this.ensureSelection();
    this.save();
  }

  selectDocument(id: string): void {
    this.activeId = id;
    this.compareVersionId = '';
    this.selectedStepId = this.current?.steps[0]?.id ?? '';
  }

  selectStep(id: string): void {
    this.selectedStepId = id;
  }

  ensureSelection(): void {
    if (!this.documents.some((item) => item.id === this.activeId)) this.activeId = this.documents[0]?.id ?? '';
    if (!this.current?.steps.some((step) => step.id === this.selectedStepId)) {
      this.selectedStepId = this.current?.steps[0]?.id ?? '';
    }
  }

  addDocument(): void {
    const id = uid('doc');
    const document: ProofDocument = {
      id,
      title: '未命名证明',
      author: '本地用户',
      goal: '$A=B$',
      symbols: { A: '待定义对象', B: '待定义对象' },
      steps: [{ id: uid('step'), type: 'premise', statement: '在这里输入前提', rule: '前提', references: [], note: '', counterexample: '', alternative: '' }],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    this.undoStack.push(clone(this.documents));
    this.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.undoStack.push(clone(this.documents));
    this.documents = this.documents.filter((item) => item.id !== id);
    this.ensureSelection();
    this.save();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step: ProofStep = {
      id: uid('step'),
      type,
      statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
      rule: type === 'goal' ? '结论' : '等式变形',
      references: this.selectedStepId ? [this.selectedStepId] : [],
      note: '',
      counterexample: '',
      alternative: '',
    };
    this.update((document) => {
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((document) => {
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((document) => {
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((document) => {
      const step = document.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  createVersion(): void {
    this.update((document) => {
      const version: ProofVersion = {
        id: uid('version'),
        name: `版本 ${document.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        steps: clone(document.steps),
        goal: document.goal,
      };
      document.versions.unshift(version);
      this.compareVersionId = version.id;
    });
    this.notify('已保存当前证明快照');
  }

  notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = '';
        redraw();
      }
    }, 2200);
  }
}

function stripLatexCommands(text: string): string {
  return text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^]/g, ' ');
}

// 公式命令与常见函数名：不登记也不视为未定义符号；普通字母则必须在符号表中说明含义。
const LATEX_COMMAND_TOKENS = new Set([
  'frac', 'sqrt', 'to', 'text', 'cdot', 'ldots', 'cdots', 'times', 'div', 'pm',
  'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'equiv', 'approx', 'iff', 'implies',
  'forall', 'exists', 'in', 'notin', 'subset', 'subseteq', 'supset', 'cup', 'cap',
  'setminus', 'emptyset', 'sum', 'prod', 'int', 'infty', 'partial', 'nabla',
  'perp', 'parallel', 'angle', 'mathbb', 'mathrm', 'mathbf', 'mathcal', 'pmod',
  'bmod', 'binom', 'overline', 'underline', 'vec', 'hat', 'bar', 'circ',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lg', 'lim', 'max',
  'min', 'sup', 'inf', 'gcd', 'lcm', 'mod', 'exp', 'deg',
]);

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const steps = document.steps;
  const indexOf = new Map(steps.map((step, index) => [step.id, index]));
  const symbolKeys = new Set(Object.keys(document.symbols));

  // 按步骤先后逐步核对：未定义符号 + 依据链顺序
  steps.forEach((step, index) => {
    const words = stripLatexCommands(step.statement).match(/[A-Za-z]+/g) ?? [];
    const unknown = new Set<string>();
    words.forEach((word) => {
      if (LATEX_COMMAND_TOKENS.has(word) || symbolKeys.has(word)) return;
      // 连写视为字母相乘（如 ab 即 a·b），逐字母核对是否都已登记
      [...word].forEach((letter) => {
        if (!symbolKeys.has(letter)) unknown.add(letter);
      });
    });
    if (unknown.size) {
      checks.push({
        id: `symbol-${step.id}`,
        severity: 'warning',
        title: '发现未定义符号',
        detail: `步骤 ${index + 1} 中的字母 ${[...unknown].join('、')} 尚未在符号表中说明含义。`,
        stepId: step.id,
      });
    }

    [...new Set(step.references)].forEach((reference) => {
      const target = indexOf.get(reference);
      if (target === undefined) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}。`, stepId: step.id });
      } else if (reference === step.id) {
        checks.push({ id: `self-${step.id}`, severity: 'error', title: '步骤引用了自己', detail: `步骤 ${index + 1} 不能把自身当作依据，请改为引用前面的步骤。`, stepId: step.id });
      } else if (target > index) {
        checks.push({ id: `forward-${step.id}-${reference}`, severity: 'error', title: '引用了后面的步骤', detail: `步骤 ${index + 1} 的依据必须写在前面，不能引用步骤 ${target + 1}。`, stepId: step.id });
      }
    });
  });

  // 循环引用：依据链绕回自身（自引用已在上面单独报告）
  const graph = new Map(steps.map((step) => [step.id, [...new Set(step.references)].filter((id) => indexOf.has(id) && id !== step.id)]));
  const state = new Map<string, 'visiting' | 'done'>();
  const cycleSteps = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      stack.slice(stack.indexOf(id)).forEach((item) => cycleSteps.add(item));
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    (graph.get(id) ?? []).forEach(dfs);
    stack.pop();
    state.set(id, 'done');
  };
  steps.forEach((step) => dfs(step.id));
  if (cycleSteps.size) {
    const names = [...cycleSteps].map((id) => `步骤 ${(indexOf.get(id) ?? 0) + 1}`).join('、');
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: `${names} 的依据链绕回自身，请断开闭环。`, stepId: [...cycleSteps][0] });
  }

  // 结论必须能从前提一步步到达：沿有效的前向依据回溯，链上每个非前提步骤都要有更早的依据
  const goalStep = steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else {
    const backwardRefs = (step: ProofStep): string[] => step.references.filter((reference) => {
      const target = indexOf.get(reference);
      return target !== undefined && target < (indexOf.get(step.id) ?? 0);
    });
    if (goalStep.references.length === 0) {
      checks.push({ id: 'goal-unlinked', severity: 'error', title: '结论缺少依据', detail: '最终步骤没有引用任何前置步骤，结论无法从前提到达。', stepId: goalStep.id });
    }
    const closure = new Set<string>([goalStep.id]);
    const queue = [goalStep.id];
    for (let head = 0; head < queue.length; head += 1) {
      const step = steps[indexOf.get(queue[head]) ?? 0];
      backwardRefs(step).forEach((reference) => {
        if (!closure.has(reference)) {
          closure.add(reference);
          queue.push(reference);
        }
      });
    }
    closure.forEach((id) => {
      const stepIndex = indexOf.get(id) ?? 0;
      const step = steps[stepIndex];
      if (step.type === 'premise' || backwardRefs(step).length > 0) return;
      if (id === goalStep.id && step.references.length === 0) return; // 已由“结论缺少依据”报告
      checks.push({
        id: `chain-${id}`,
        severity: 'error',
        title: '依据链在此中断',
        detail: step.references.length === 0
          ? `步骤 ${stepIndex + 1} 没有引用任何前序步骤，结论无法由此追溯到前提。`
          : `步骤 ${stepIndex + 1} 的引用指向后面、缺失或自身，结论无法由此追溯到前提。`,
        stepId: id,
      });
    });
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '依据链按步骤先后完整，结论可追溯到前提。' });
  }
  return checks;
}

export function compareVersion(document: ProofDocument, version: ProofVersion) {
  const result = [];
  const size = Math.max(document.steps.length, version.steps.length);
  for (let index = 0; index < size; index += 1) {
    const before = version.steps[index]?.statement ?? '';
    const after = document.steps[index]?.statement ?? '';
    const kind = !before ? 'added' : !after ? 'removed' : before === after ? 'same' : 'changed';
    result.push({ kind, label: `步骤 ${index + 1}`, before, after } as const);
  }
  return result;
}

export function createId(prefix: string): string {
  return uid(prefix);
}
