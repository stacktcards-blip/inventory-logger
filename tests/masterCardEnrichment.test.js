import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPokemonPriceTrackerCardSetQueries,
  compareMasterCardCandidates,
  normalizePokemonPriceTrackerCard
} from '../dist/services/masterCardEnrichment.js';

const baseCard = {
  id: 'sv1-1',
  name: 'Sprigatito',
  number: '1/198',
  setId: 'sv1',
  setName: 'Scarlet & Violet',
  language: 'English',
  rarity: 'Common'
};

const mapping = {
  source: 'pokemon_price_tracker',
  sourceSetId: 'sv1',
  sourceSetName: 'Scarlet & Violet',
  lang: 'ENG',
  stacktSetAbbr: 'SVI',
  status: 'confirmed'
};

test('normalizes Pokemon Price Tracker English card data into Stackt strict key shape', () => {
  const candidate = normalizePokemonPriceTrackerCard(baseCard, mapping);

  assert.equal(candidate.source, 'pokemon_price_tracker');
  assert.equal(candidate.sourceCardId, 'sv1-1');
  assert.equal(candidate.sourceSetId, 'sv1');
  assert.equal(candidate.sourceSetName, 'Scarlet & Violet');
  assert.equal(candidate.normalizedCardName, 'Sprigatito');
  assert.equal(candidate.normalizedSetAbbr, 'SVI');
  assert.equal(candidate.normalizedNum, '1');
  assert.equal(candidate.normalizedLang, 'ENG');
  assert.equal(candidate.sourceRarity, 'Common');
});

test('normalizes numeric Pokemon Price Tracker IDs without crashing', () => {
  const candidate = normalizePokemonPriceTrackerCard({ ...baseCard, id: 250295, setId: 2867 }, mapping);

  assert.equal(candidate.sourceCardId, '250295');
  assert.equal(candidate.sourceSetId, '2867');
});

test('preserves lettered gallery and promo style card numbers when normalizing', () => {
  const tg = normalizePokemonPriceTrackerCard({ ...baseCard, id: 'swsh9tg-TG01', number: 'TG01/TG30' }, mapping);
  const gg = normalizePokemonPriceTrackerCard({ ...baseCard, id: 'swsh12pt5gg-GG01', number: 'GG01/GG70' }, mapping);
  const svp = normalizePokemonPriceTrackerCard({ ...baseCard, id: 'svp-131', number: '131' }, { ...mapping, stacktSetAbbr: 'SVP' });

  assert.equal(tg.normalizedNum, 'TG01');
  assert.equal(gg.normalizedNum, 'GG01');
  assert.equal(svp.normalizedNum, '131');
});

test('classifies staged candidates against existing master_cards records', () => {
  const candidates = [
    normalizePokemonPriceTrackerCard(baseCard, mapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'sv1-2', name: 'Fuecoco', number: '002/198' }, mapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'sv1-3', name: 'Quaxly', number: '003/198' }, mapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'sv1-dup', name: 'Quaxly Stamped', number: '003/198' }, mapping)
  ];

  const existing = [
    { id: 10, cardName: 'Sprigatito', setAbbr: 'SVI', num: '001', lang: 'ENG' },
    { id: 11, cardName: 'Different Name', setAbbr: 'SVI', num: '002', lang: 'ENG' }
  ];

  const compared = compareMasterCardCandidates(candidates, existing);

  assert.equal(compared[0].normalizedNum, '001');
  assert.equal(compared[0].matchStatus, 'MATCHED_EXISTING');
  assert.equal(compared[0].existingMasterCardId, 10);
  assert.equal(compared[1].normalizedNum, '002');
  assert.equal(compared[1].matchStatus, 'CARD_NAME_CONFLICT');
  assert.equal(compared[1].existingMasterCardId, 11);
  assert.equal(compared[2].normalizedNum, '003');
  assert.equal(compared[2].matchStatus, 'NEW_CARD_CANDIDATE');
  assert.equal(compared[3].normalizedNum, '003');
  assert.equal(compared[3].matchStatus, 'NEW_CARD_CANDIDATE');
});

test('only marks duplicate source rows as variants when a base master_card exists', () => {
  const candidates = [
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'sv1-base', name: 'Quaxly', number: '003/198' }, mapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'sv1-variant', name: 'Quaxly Stamped', number: '003/198' }, mapping)
  ];

  const compared = compareMasterCardCandidates(candidates, [
    { id: 12, cardName: 'Quaxly', setAbbr: 'SVI', num: '003', lang: 'ENG' }
  ]);

  assert.equal(compared[0].matchStatus, 'MATCHED_EXISTING');
  assert.equal(compared[0].existingMasterCardId, 12);
  assert.equal(compared[1].matchStatus, 'VARIANT_CANDIDATE');
  assert.equal(compared[1].existingMasterCardId, 12);
});

test('uses unpadded master_cards card numbers for older set conventions like Generations', () => {
  const genMapping = { ...mapping, sourceSetId: 'gen', sourceSetName: 'Generations', stacktSetAbbr: 'GEN' };
  const candidates = [
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'gen-9', name: 'Pinsir', number: '9/83' }, genMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'gen-43', name: 'Geodude', number: '043/083' }, genMapping)
  ];

  const compared = compareMasterCardCandidates(candidates, [
    { id: 20, cardName: 'Pinsir', setAbbr: 'GEN', num: '9', lang: 'ENG' },
    { id: 21, cardName: 'Geodude', setAbbr: 'GEN', num: '43', lang: 'ENG' }
  ]);

  assert.equal(compared[0].normalizedNum, '9');
  assert.equal(compared[0].matchStatus, 'MATCHED_EXISTING');
  assert.equal(compared[1].normalizedNum, '43');
  assert.equal(compared[1].matchStatus, 'MATCHED_EXISTING');
});

test('strips set abbreviation prefixes from promo card numbers for grouped promo sets', () => {
  const swshMapping = { ...mapping, sourceSetId: 'swsh-promos', sourceSetName: 'SWSH: Sword & Shield Promo Cards', stacktSetAbbr: 'SWSH' };
  const candidate = normalizePokemonPriceTrackerCard({ ...baseCard, id: 'swsh307', name: 'Arceus VSTAR - SWSH307', number: 'SWSH307' }, swshMapping);
  const [compared] = compareMasterCardCandidates([candidate], [
    { id: 307, cardName: 'Arceus VSTAR', setAbbr: 'SWSH', num: '307', lang: 'ENG' }
  ]);

  assert.equal(candidate.normalizedNum, '307');
  assert.equal(compared.normalizedNum, '307');
  assert.equal(compared.matchStatus, 'MATCHED_EXISTING');
});

test('flags source rows whose card-number denominator does not match the dominant mapped set total', () => {
  const celMapping = { ...mapping, sourceSetId: 'cel', sourceSetName: 'Celebrations', stacktSetAbbr: 'CEL' };
  const candidates = [
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'cel-1', name: 'Ho-Oh', number: '001/025' }, celMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'cel-2', name: 'Reshiram', number: '002/025' }, celMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'cel-3', name: 'Kyogre', number: '003/025' }, celMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'cel-4', name: 'Palkia', number: '004/025' }, celMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'cel-5', name: 'Pikachu', number: '005/025' }, celMapping),
    normalizePokemonPriceTrackerCard({ ...baseCard, id: 'polluted-pony', name: 'Ponyta', number: '014/083' }, celMapping)
  ];

  const compared = compareMasterCardCandidates(candidates, [
    { id: 100, cardName: 'Cosmoem', setAbbr: 'CEL', num: '014', lang: 'ENG' }
  ]);

  assert.equal(compared[5].matchStatus, 'PARSE_INCOMPLETE');
  assert.match(compared[5].matchReason, /denominator 83 does not match/);
});

test('marks candidates as needing a set mapping when no confirmed Stackt set abbreviation exists', () => {
  const candidate = normalizePokemonPriceTrackerCard(baseCard, null);
  const [compared] = compareMasterCardCandidates([candidate], []);

  assert.equal(candidate.normalizedSetAbbr, null);
  assert.equal(compared.matchStatus, 'SET_MAPPING_NEEDED');
});

test('builds Pokemon Price Tracker card fetch queries using set name before opaque internal set id', () => {
  const queries = buildPokemonPriceTrackerCardSetQueries(mapping);

  assert.equal(queries[0], 'set=Scarlet%20%26%20Violet&fetchAllInSet=true');
  assert.equal(queries[1], 'setId=sv1&fetchAllInSet=true');
});
