// Trimmed real-shape Crossref `/works/<doi>` responses; no network in tests.

/** A normal journal article: array-valued titles, HTML in the title, hyphenated page range. */
export const CROSSREF_ARTICLE = {
  status: 'ok',
  'message-type': 'work',
  message: {
    DOI: '10.1000/xyz123',
    type: 'journal-article',
    title: ['On <i>Sola Gratia</i> &amp; the Lutheran Confessions'],
    author: [
      { given: 'Jane', family: 'Smith', sequence: 'first' },
      { given: 'John Q.', family: 'Doe', sequence: 'additional' }
    ],
    'container-title': ['Concordia Journal'],
    volume: '12',
    issue: '3',
    page: '45-67',
    issued: { 'date-parts': [[1998, 5]] }
  }
}

/** Sparse record: an organisation author, an e-location "page", no issue, year only in published-online. */
export const CROSSREF_SPARSE = {
  status: 'ok',
  message: {
    DOI: '10.2000/abc',
    title: ['A Short Note'],
    author: [{ name: 'Lutheran Church Commission' }],
    'short-container-title': ['LCC Rev'],
    volume: '7',
    page: 'e1234',
    'published-online': { 'date-parts': [[2021]] }
  }
}
