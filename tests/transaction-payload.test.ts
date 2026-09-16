import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { decodePayload } from '../src/lib/transaction-payload.ts';
const payload = (data: string, filetype = 'text/plain') => ({ data, metadata: JSON.stringify({ filetype, filename: 'test.txt' }) });
test('real gateway frog decodes and retains ASCII spacing', () => {
  const frog = JSON.parse(readFileSync(new URL('./fixtures/frog.json', import.meta.url), 'utf8'));
  const result = decodePayload(frog);
  assert.equal(result.text, Buffer.from(frog.data, 'base64').toString('utf8'));
  assert.equal(result.text!.split('\n').length, 19);
  assert.equal(result.filename, 'frog.txt');
});
test('Korean and emoji retain UTF-8', () => {
  const text = '안녕하세요 새 친구 🐸';
  assert.equal(decodePayload(payload(Buffer.from(text).toString('base64'))).text, text);
});
test('plain text and raw JSON remain readable', () => {
  assert.equal(decodePayload(payload('hello new friend')).text, 'hello new friend');
  assert.equal(decodePayload(payload('{"p":"asc-1"}', 'application/json')).text, '{\n  "p": "asc-1"\n}');
});
test('short base64 JSON decodes once', () => {
  assert.equal(decodePayload(payload('eyJhIjoxfQ==', 'application/json')).text, '{\n  "a": 1\n}');
});
test('malformed and non-object metadata cannot crash rendering', () => {
  for (const metadata of ['null','[]','3','{bad','{"filename":42,"filetype":[]}']) assert.equal(decodePayload({data:'hello',metadata}).filename,'download');
});
test('unknown binary has download bytes without pretending to be text', () => {
  const result = decodePayload({data: '/wABAg==', metadata: '{"filename":"test.bin","filetype":"application/octet-stream"}'});
  assert.equal(result.text,null); assert.equal(result.base64,'/wABAg==');
});
test('HTML and SVG remain strings, never executable markup', () => {
  for (const type of ['text/html','image/svg+xml']) assert.equal(decodePayload(payload('<script>alert(1)</script>',type)).text,'<script>alert(1)</script>');
});
test('image data URI is normalized and invalid base64 stays plain', () => {
  assert.equal(decodePayload(payload('data:image/png;base64,iVBORw==','image/png')).base64,'iVBORw==');
  assert.equal(decodePayload(payload('bad=base64')).text,'bad=base64');
});
test('empty text is a valid file', () => assert.equal(decodePayload(payload('')).text,''));

test('base64-looking plain words stay intact when bytes are not UTF-8', () => {
  for (const word of ['test', 'data']) {
    const result = decodePayload(payload(word));
    assert.equal(result.text, word); assert.equal(result.base64, null);
  }
});
