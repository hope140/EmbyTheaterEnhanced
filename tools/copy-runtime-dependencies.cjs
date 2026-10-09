'use strict';

const contract = require('./runtime-dependency-contract.cjs');

if (require.main === module) {
    contract.main(process.argv.slice(2));
}

module.exports = contract;
