import * as core from "@actions/core";
import * as sinon from 'sinon';
import * as runner from "../src/runner";

describe('parasoft-coverage-action/runner', () => {
    describe('customizeJobRunSummary', () => {
        let sandbox: sinon.SinonSandbox;
        let summaryAddRawStub: sinon.SinonStub;
        let summaryWriteStub: sinon.SinonStub;
        let consoleErrorSpy: sinon.SinonSpy;

        const coverageNode: runner.CoberturaCoverageNode = {
            lineRate: 0.85,
            linesCovered: 85,
            linesValid: 100,
            packages: new Map([
                [
                    'package1',
                    {
                        name: 'package1',
                        lineRate: 0.8,
                        classes: new Map([
                            [
                                'class1',
                                {
                                    classId: 'class1-file',
                                    fileName: 'file1',
                                    name: 'class1',
                                    lineRate: 0.9,
                                    coveredLines: 9,
                                    lines: [
                                        { lineNumber: 1, lineHash: 'abc', hits: 1 },
                                        { lineNumber: 2, lineHash: 'def', hits: 1 },
                                    ],
                                },
                            ],
                        ]),
                    },
                ],
            ]),
        };

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            summaryAddRawStub = sandbox.stub(core.summary, 'addRaw').returnsThis();
            summaryWriteStub = sandbox.stub(core.summary, 'write').resolves();
            consoleErrorSpy = sandbox.spy(console, 'error');
        });

        afterEach(() => {
            sandbox.restore();
            summaryAddRawStub.restore();
            summaryWriteStub.restore();
            consoleErrorSpy.restore();
        });

        it('normal', async () => {
            await new runner.CoverageParserRunner().customizeJobRunSummary(coverageNode);

            const rawContent = summaryAddRawStub.getCall(0).args[0];
            sinon.assert.match(rawContent, "<table>" +
                                                "<tbody>" +
                                                    "<tr>" +
                                                        "<th>Coverage&emsp;(covered/total - percentage)</th>" +
                                                    "</tr>" +
                                                    "<tr>" +
                                                        "<td>" +
                                                            "<b>Total coverage&emsp;(85/100 - 85.00%)</b>" +
                                                        "</td>" +
                                                    "</tr>" +
                                                    "<tr>" +
                                                        "<td>" +
                                                            "<details>" +
                                                                "<summary>package1&emsp;(9/2 - 80.00%)</summary>" +
                                                                "<table>" +
                                                                    "<tbody>" +
                                                                        "<tr>" +
                                                                            "<td>&emsp;class1&emsp;(9/2 - 90.00%)</td>" +
                                                                        "</tr>" +
                                                                    "</tbody>" +
                                                                "</table>" +
                                                            "</details>" +
                                                        "</td>" +
                                                    "</tr>" +
                                                "</tbody>" +
                                            "</table>");
            sinon.assert.calledOnce(summaryAddRawStub);
            sinon.assert.calledOnce(summaryWriteStub);
        });

        it('should handle error and not call core.summary.addRaw or core.summary.write', async () => {
            const coverageParserRunner = new runner.CoverageParserRunner() as any;
            sandbox.replace(coverageParserRunner, 'formatCoverage', sandbox.fake.throws(new Error('Formatting error')));

            try {
                await coverageParserRunner.customizeJobRunSummary(coverageNode);
                sinon.assert.fail('Expected error to be thrown');
            } catch (error) {
                sinon.assert.calledWith(consoleErrorSpy, 'An error occurred while customizing the job run summary:', sinon.match.instanceOf(Error));
                sinon.assert.notCalled(summaryAddRawStub);
                sinon.assert.notCalled(summaryWriteStub);
            }
        });
    })
})