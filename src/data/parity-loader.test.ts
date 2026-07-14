import { describe, expect, it } from 'vitest';
import { aggregateElementChange } from './parity-loader';

// bahmni PR#180 regression: an element citing one added wrapper among a
// large unchanged call chain must NOT render as newly added.
describe('aggregateElementChange', () => {
  it('is null when nothing matched (untouched element)', () => {
    expect(aggregateElementChange([null, null, null])).toBeNull();
    expect(aggregateElementChange([])).toBeNull();
  });

  it('one added wrapper among a long unchanged chain reads as modified', () => {
    const chain = ['added', ...Array(26).fill(null)] as ('added' | null)[];
    expect(aggregateElementChange(chain)).toBe('modified');
  });

  it('a majority-new task reads as added', () => {
    expect(aggregateElementChange(['added', 'added', 'added', null])).toBe('added');
    expect(aggregateElementChange(['added'])).toBe('added');
  });

  it('an exact half of added FQNs is not a majority — modified', () => {
    expect(aggregateElementChange(['added', null])).toBe('modified');
  });

  it('mixed added+modified reads as modified', () => {
    expect(aggregateElementChange(['added', 'modified', 'added'])).toBe('modified');
  });

  it('all-deleted majority reads as deleted; mixed deletion does not', () => {
    expect(aggregateElementChange(['deleted', 'deleted', null])).toBe('deleted');
    expect(aggregateElementChange(['deleted', 'modified'])).toBe('modified');
  });
});
