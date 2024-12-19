import * as sinon from 'sinon';
import * as main from '../src/main';
import * as runner from '../src/runner';

describe('parasoft-coverage-action/main', () => {
    describe('run', () => {
        const sandbox = sinon.createSandbox();

        let fakeCustomizedJobRunSummary : sinon.SinonSpy;

        beforeEach(() => {
            fakeCustomizedJobRunSummary = sandbox.fake.resolves({});
            sandbox.replace(runner.CoverageParserRunner.prototype, 'customizeJobRunSummary', fakeCustomizedJobRunSummary);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it("should call customizeJobRunSummary", async () => {
            await main.run();
            sinon.assert.calledOnce(fakeCustomizedJobRunSummary);
        });
    });
});