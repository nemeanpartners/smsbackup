const { AttributedStringParser } = require('./parsers/attributed-string-parser');
const { parseMessageSummary } = require('./parsers/message-summary-parser');

function parseAttributedBody(buffer, options) {
  const parser = new AttributedStringParser(options);
  return parser.parse(buffer);
}

module.exports = {
  AttributedStringParser,
  parseAttributedBody,
  parseMessageSummary
};
