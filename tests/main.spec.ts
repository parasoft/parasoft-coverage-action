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

        let customOption : runner.RunOptions;
        let runnerExitCode: number;

        const fakeGetInput = (key): string => {
            switch (key) {
                case "report":
                    return customOption.report;
                case "parasoftToolOrJavaRootPath":
                    return customOption.parasoftToolOrJavaRootPath;
                default:
                    return '';
            }
        }

        beforeEach(() => {
            coreSetFailed = sandbox.fake();
            sandbox.replace(core, 'setFailed', coreSetFailed);
            coreInfo = sandbox.fake();
            sandbox.replace(core, 'info', coreInfo);
            coreError = sandbox.fake();
            sandbox.replace(core, 'error', coreError);
            sandbox.replace(core, 'getInput', fakeGetInput);
            runnerExitCode = 0;
            customOption = {
                report: "D:/test/coverage.xml",
                parasoftToolOrJavaRootPath: "C:/Java",
            }
        });

        afterEach(() => {
            sandbox.restore();
        });

        const setUpFakeRunner = () => {
            fakeCoverageParserRunner = sandbox.fake.resolves({ exitCode: runnerExitCode });
            sandbox.replace(runner.CoverageParserRunner.prototype, 'run', fakeCoverageParserRunner);
        }

        it('Parse coverage report with exit code 0', async () => {
            setUpFakeRunner();

            await main.run();

            sinon.assert.notCalled(coreSetFailed);
            sinon.assert.notCalled(coreError);
            sinon.assert.calledWith(fakeCoverageParserRunner, customOption);
            sinon.assert.calledWith(coreInfo, messagesFormatter.format(messages.exit_code, runnerExitCode));
        });

        it('Run coverage parser with non-zero exit code', async () => {
            runnerExitCode = 1;
            setUpFakeRunner();

            await main.run();

            sinon.assert.calledWith(coreSetFailed, messagesFormatter.format(messages.failed_convert_report, runnerExitCode));
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