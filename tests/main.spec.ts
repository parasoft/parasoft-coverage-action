import * as sinon from 'sinon';
import * as core from '@actions/core';
import * as main from '../src/main';
import * as runner from '../src/runner';

import {messages, messagesFormatter} from '../src/messages';

describe('parasoft-coverage-action/main', () => {
    describe('run', () => {
        const sandbox = sinon.createSandbox();

        let coreSetFailed : sinon.SinonSpy;
        let coreInfo : sinon.SinonSpy;
        let coreError : sinon.SinonSpy;
        let fakeCoverageParserRunner : sinon.SinonSpy;

        beforeEach(() => {
            coreSetFailed = sandbox.fake();
            sandbox.replace(core, 'setFailed', coreSetFailed);
            coreInfo = sandbox.fake();
            sandbox.replace(core, 'info', coreInfo);
            coreError = sandbox.fake();
            sandbox.replace(core, 'error', coreError);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('Parse coverage report with exit code 0', async () => {
            const runnerExitCode = 0;
            fakeCoverageParserRunner = sandbox.fake.resolves({exitCode: runnerExitCode});
            sandbox.replace(runner.CoverageParserRunner.prototype, 'run', fakeCoverageParserRunner);

            await main.run();

            sinon.assert.notCalled(coreSetFailed);
            sinon.assert.notCalled(coreError);
            sinon.assert.calledWith(coreInfo, messagesFormatter.format(messages.exit_code + runnerExitCode));
        });

        it('Error happen', async function() {
            fakeCoverageParserRunner = sandbox.fake.throws(new Error('Error message'));
            sandbox.replace(runner.CoverageParserRunner.prototype, 'run', fakeCoverageParserRunner);

            await main.run();

            sinon.assert.calledOnce(coreSetFailed);
            sinon.assert.calledTwice(coreError);
            sinon.assert.calledWith(coreError.getCall(0), messages.run_failed);
            sinon.assert.calledWith(coreSetFailed, 'Error message');
        });
    });
});