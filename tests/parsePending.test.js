import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { parsePendingSources } from '../dist/jobs/parsePending.js';

const parseJapanEmail = () => ({
  store: 'CardRush',
  purchaseDate: null,
  orderNo: null,
  items: [],
  confidence: 0,
  flags: []
});

const calls = {
  updateSourceStatus: [],
  insertPurchaseParse: [],
  insertDrafts: []
};

describe('parsePendingSources', () => {
  beforeEach(() => {
    calls.updateSourceStatus = [];
    calls.insertPurchaseParse = [];
    calls.insertDrafts = [];
  });

  it('marks sources as error when no line items parsed', async () => {
    const deps = {
      listSourcesByStatus: async () => [
        {
          id: 'source-1',
          raw_subject: null,
          raw_from: null,
          raw_body_text: 'no items',
          raw_body_html: null
        }
      ],
      updateSourceStatus: async (...args) => {
        calls.updateSourceStatus.push(args);
      },
      updateSourceMetadata: async () => {},
      insertPurchaseParse: async (...args) => {
        calls.insertPurchaseParse.push(args);
        return { id: 'parse-1' };
      },
      insertDrafts: async (...args) => {
        calls.insertDrafts.push(args);
        return [];
      },
      parseJapanEmail,
      parserVersion: 'test-parser'
    };

    await parsePendingSources(deps);

    assert.equal(calls.insertPurchaseParse.length, 1);
    assert.equal(calls.insertPurchaseParse[0][0].purchase_source_id, 'source-1');
    assert.equal(calls.insertPurchaseParse[0][0].status, 'error');
    assert.equal(calls.insertPurchaseParse[0][0].error, 'No line items parsed');
    assert.equal(calls.updateSourceStatus.length, 1);
    assert.deepEqual(calls.updateSourceStatus[0], ['source-1', 'error', 'No line items parsed']);
    assert.equal(calls.insertDrafts.length, 0);
  });
});
