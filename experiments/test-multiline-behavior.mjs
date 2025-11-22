import { createQADatabase } from '/Users/konard/Code/Archive/konard/hh-job-application-automation/src/qa-database.mjs';
import fs from 'fs/promises';

const testFile = '/tmp/test-multiline2.lino';
const db = createQADatabase(testFile);

// Complex multiline question and answer
const question = `- Работали ли с async io на питоне (есть ли опыт работы с асинхронным кодом), какие задачи решали
- Приходилось ли работать на проектах с микросервисной архитектурой? Если да, сколько было микросервисов, примерно.
- Какой был размер самой крупной команды, где вам удалось поработать (примерно)?Сколько было разработчиков? Был ли BA, QA отдел?
- Был ли опыт управления командой? Если был, то сколько человек было в команде?`;

const answer = `- Python имеет очень низкую производительность
- Я предпочитаю JavaScript или Rust
- Из плюсов Python имеет высокую популярность среди разработчиков`;

await db.addOrUpdateQA(question, answer);
const retrieved = await db.getAnswer(question);

console.log('=== Complex multiline ===');
console.log('Expected answer:', JSON.stringify(answer));
console.log('Retrieved:', JSON.stringify(retrieved));
console.log('Match:', JSON.stringify(retrieved) === JSON.stringify(answer));
console.log('Array?:', Array.isArray(retrieved));
console.log('');

// Check file content
const fileContent = await fs.readFile(testFile, 'utf8');
console.log('File content:');
console.log(fileContent);
