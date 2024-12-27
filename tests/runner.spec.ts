import * as sinon from 'sinon';
import * as core from "@actions/core";
import * as runner from '../src/runner';
import * as types from "../src/types";
import * as fs from "node:fs";
import * as path from "node:path";

describe('parasoft-coverage-action/runner', () => {
    const sandbox = sinon.createSandbox();

    const coverageNode: types.CoberturaCoverage = {
        lineRate: 0,
        linesCovered: 0,
        linesValid: 0,
        packages: new Map<string, types.CoberturaPackage>()
    };

    afterEach(() => {
        sandbox.restore();
    });

    describe('run()', () => {
        beforeEach(() => {
            if (process.env.GITHUB_ACTIONS) {
                const summaryFilePath = path.join(process.cwd(), 'summary-file.txt');
                fs.writeFileSync(summaryFilePath, '');
                fs.chmodSync(summaryFilePath, 0o666); // Set file permissions to be readable and writable
                process.env.GITHUB_STEP_SUMMARY = summaryFilePath;
            } else {
                process.env.GITHUB_STEP_SUMMARY = __dirname;
            }
        });

        it('Generate the coverage summary', async () => {
            const coverageParserRunner = new runner.CoverageParserRunner();

            sandbox.stub(coverageParserRunner, 'getCoberturaCoverage').returns(coverageNode);
            const addRawStub = sandbox.stub(core.summary, 'addRaw').returns(core.summary);
            const addHeadingStub = sandbox.stub(core.summary, 'addHeading').returns(core.summary);

            await coverageParserRunner.run();

            sinon.assert.calledOnce(addRawStub);
            sinon.assert.calledOnce(addHeadingStub);
            sinon.assert.calledWith(addRawStub, sinon.match.string);
        });
    });
})