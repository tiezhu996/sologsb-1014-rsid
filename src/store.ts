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

/**
 * 去掉 LaTeX 公式命令（如 \frac、\sqrt、\alpha）与括号/上下标标记，
 * 公式命令无需登记；剩下的字母序列即视为需要解释的普通符号。
 */
function extractIdentifiers(text: string): string[] {
  const stripped = text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^$&\\]/g, ' ');
  return stripped.match(/[A-Za-z][A-Za-z0-9']*/g) ?? [];
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const steps = document.steps;
  const indexById = new Map(steps.map((step, index) => [step.id, index]));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const labelAt = (index: number) => `步骤 ${index + 1}`;

  // 1) 逐行核对：未解释符号（提示级），不校验依据先后。
  steps.forEach((step, index) => {
    const tokens = extractIdentifiers(step.statement);
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token)))];
    if (unknown.length) {
      checks.push({
        id: `symbol-${step.id}`,
        severity: 'warning',
        title: '发现未解释的符号',
        detail: `${labelAt(index)} 使用了未在符号表中解释的：${unknown.join('、')}。公式命令无需登记，普通字母请补充含义。`,
        stepId: step.id,
      });
    }
  });

  // 2) 按步骤先后逐条核对依据：缺失、引用自己、引用后续步骤都直接判错。
  steps.forEach((step, index) => {
    if (step.type === 'premise' && step.references.length > 0) {
      checks.push({
        id: `premise-ref-${step.id}`,
        severity: 'warning',
        title: '前提步骤不应引用依据',
        detail: `${labelAt(index)} 被标为前提，前提应独立成立，无需引用其他步骤。`,
        stepId: step.id,
      });
    }
    step.references.forEach((reference) => {
      if (!indexById.has(reference)) {
        checks.push({
          id: `missing-${step.id}-${reference}`,
          severity: 'error',
          title: '引用步骤不存在',
          detail: `${labelAt(index)} 引用了已删除或不存在的步骤。`,
          stepId: step.id,
        });
        return;
      }
      if (reference === step.id) {
        checks.push({
          id: `self-${step.id}`,
          severity: 'error',
          title: '步骤引用了自己',
          detail: `${labelAt(index)} 把自己列为依据，推导不能自证。`,
          stepId: step.id,
        });
        return;
      }
      const referenceIndex = indexById.get(reference)!;
      if (referenceIndex > index) {
        checks.push({
          id: `forward-${step.id}-${reference}`,
          severity: 'error',
          title: '引用了后续步骤',
          detail: `${labelAt(index)} 引用了排在其后的步骤 ${referenceIndex + 1}，依据只能来自此前已经写下的步骤。`,
          stepId: step.id,
        });
      }
    });
  });

  // 3) 兜底检查绕回自身的循环链（自引已在第 2 步单独报错，此处排除）。
  const graph = new Map(steps.map((step) => [step.id, step.references.filter((id) => indexById.has(id) && id !== step.id)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleSteps = new Set<string>();
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      path.slice(path.indexOf(id)).forEach((item) => cycleSteps.add(item));
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const hasCycle = (graph.get(id) ?? []).some((next) => visit(next, [...path, id]));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  steps.forEach((step) => visit(step.id, []));
  cycleSteps.forEach((id) => {
    const index = indexById.get(id)!;
    checks.push({
      id: `cycle-${id}`,
      severity: 'error',
      title: '依据链绕回自身',
      detail: `${labelAt(index)} 处于循环引用链中，沿依据追溯会绕回本步，请调整引用关系。`,
      stepId: id,
    });
  });

  // 4) 从前提出发沿依据链前向传播：结论必须能一步步追溯到前提。
  //    仅承认“存在、位于此前、且不是自己”的引用为有效依据。
  const grounded = new Set<string>();
  steps.forEach((step, index) => {
    if (step.type !== 'premise') return;
    const structurallyValid = step.references.every((reference) => {
      const referenceIndex = indexById.get(reference);
      return referenceIndex !== undefined && referenceIndex < index && reference !== step.id;
    });
    if (structurallyValid) grounded.add(step.id);
  });
  steps.forEach((step, index) => {
    if (grounded.has(step.id) || cycleSteps.has(step.id)) return;
    if (step.type === 'premise') return;
    if (step.references.length === 0) return; // 无依据由专门的检查项提示
    const validRefs = step.references.filter((reference) => {
      const referenceIndex = indexById.get(reference);
      return referenceIndex !== undefined && referenceIndex < index && reference !== step.id;
    });
    const ownStructureOkay = validRefs.length === step.references.length;
    const allGrounded = validRefs.length > 0 && validRefs.every((reference) => grounded.has(reference));
    if (allGrounded) grounded.add(step.id);
    else if (ownStructureOkay) {
      // 本步引用格式无误，但依据链在更上游断开：结论无法从前提到达。
      const broken = validRefs.filter((reference) => !grounded.has(reference)).map((reference) => labelAt(indexById.get(reference)!));
      checks.push({
        id: `ungrounded-${step.id}`,
        severity: 'error',
        title: step.type === 'goal' ? '结论无法从前提到达' : '依据链断在中途',
        detail: step.type === 'goal'
          ? `最终结论的依据 ${broken.join('、')} 尚未成立，结论不能从前提一步步推出。`
          : `${labelAt(index)} 的依据 ${broken.join('、')} 未能追溯到前提，本步推导悬空。`,
        stepId: step.id,
      });
    }
  });

  // 5) 结论步骤检查：必须存在且有依据；能否从前提到达已在第 4 步判定。
  const goalStep = steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '稿中还没有“结论”类型的最终步骤，无法看出究竟证明了什么。', anchor: 'steps' });
  } else if (goalStep.references.length === 0) {
    checks.push({
      id: 'goal-unlinked',
      severity: 'warning',
      title: '结论尚无推导支撑',
      detail: '最终结论没有引用任何前置步骤，应从最后的推导步骤得出。',
      stepId: goalStep.id,
    });
  }

  // 6) 汇总：检查项按步骤先后排列，全局项排在最后。
  checks.sort((a, b) => (a.stepId ? indexById.get(a.stepId) ?? Infinity : Infinity) - (b.stepId ? indexById.get(b.stepId)! : Infinity));
  if (!checks.some((check) => check.severity === 'error')) {
    const warningCount = checks.filter((check) => check.severity === 'warning').length;
    checks.push({
      id: 'proof-ok',
      severity: 'info',
      title: '依据链检查通过',
      detail: warningCount
        ? `所有结论均可从前提沿依据链一步步到达；另有 ${warningCount} 个提示项可核对。`
        : '所有结论均可从前提沿依据链一步步到达，结构无误。',
      anchor: 'steps',
    });
  }
  return checks;
}

/** 存在结构性错误（错误级检查项）时阻止导出定稿。 */
export function hasBlockingErrors(document: ProofDocument): boolean {
  return validate(document).some((check) => check.severity === 'error');
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
