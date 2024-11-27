import * as main from "../src/main";
import * as assert from "assert";

describe('parasoft-coverage-action/main', () => {
    it('add', () => {
        /*
        * This Comment will be removed when writing the tests
        * About test lib:
        * - sinon is used for mocking
        * - mocha is used for test runner
        * - nyc is used for code coverage
        */
        assert.strictEqual(main.printLog(), "Hello, World!");
    });
});