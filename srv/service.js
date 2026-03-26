const metadataLoad = require('./metadata-load');

// module.exports = async function () {
module.exports = cds.service.impl(async function () {
  metadataLoad(this);
});