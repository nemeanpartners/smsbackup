const { extractMessageBody, isLikelyReadableText } = require('../message-body');
const { parseAttributedBody } = require('../vendor/imessage-parser');

function buildSampleAttributedBody(text) {
  const textBuffer = Buffer.from(text, 'utf8');
  return Buffer.concat([
    Buffer.from('streamtyped'),
    Buffer.from('NSMutableAttributedStringNSAttributedStringNSString'),
    Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
    Buffer.from([textBuffer.length]),
    textBuffer
  ]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sampleText = 'Yes u obv look the best there';
const sampleBlob = buildSampleAttributedBody(sampleText);

assert(!isLikelyReadableText('\uFFFD'), 'replacement char should be rejected');
assert(!isLikelyReadableText('\x01'), 'control char text should be rejected');
assert(isLikelyReadableText('0426678714'), 'phone numbers should be readable');
assert(
  parseAttributedBody(sampleBlob).text.includes('Yes u obv look'),
  'typedstream parser should decode sample text'
);
assert(
  extractMessageBody('\uFFFD', sampleBlob) === sampleText,
  'garbage text column should not override attributedBody'
);
assert(
  extractMessageBody('', sampleBlob) === sampleText,
  'empty text should decode attributedBody'
);
assert(
  extractMessageBody('Plain text message', null) === 'Plain text message',
  'plain text column should still work'
);

console.log('message-body tests passed');
