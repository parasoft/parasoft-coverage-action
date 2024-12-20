import * as sinon from 'sinon';
import * as core from "@actions/core";
import * as runner from '../src/runner';
import * as types from "../src/types";
import * as fs from "node:fs";
import * as path from "node:path";

import {messages} from "../src/messages";

describe('parasoft-coverage-action/runner', () => {
    const sandbox = sinon.createSandbox();

    const validCoverageNode: types.CoberturaCoverage = {
        lineRate: 0.6667,
        linesCovered: 6,
        linesValid: 9,
        packages: new Map<string, types.CoberturaPackage>([
            [
                'com.example.package1', // Package name
                {
                    name: 'com.example.package1',
                    lineRate: 0.6667,
                    classes: new Map<string, types.CoberturaClass>([
                        [
                            'MyClass1.java', // Class file name
                            {
                                classId: 'MyClass1.java|MyClass1', // Combination of filename + class name
                                fileName: 'MyClass1.java',
                                name: 'MyClass1',
                                lineRate: 0.6667,
                                coveredLines: 2,
                                lines: [
                                    { lineNumber: 1, lineHash: 'abc123', hits: 1 },
                                    { lineNumber: 2, lineHash: 'def456', hits: 0 },
                                    { lineNumber: 3, lineHash: 'ghi789', hits: 1 },
                                ]
                            }
                        ],
                        [
                            'MyClass2.java',
                            {
                                classId: 'MyClass2.java|MyClass2',
                                fileName: 'MyClass2.java',
                                name: 'MyClass2',
                                lineRate: 0.6667,
                                coveredLines: 2,
                                lines: [
                                    { lineNumber: 1, lineHash: 'jkl012', hits: 1 },
                                    { lineNumber: 2, lineHash: 'mno345', hits: 0 },
                                    { lineNumber: 3, lineHash: 'pqr678', hits: 1 }
                                ]
                            }
                        ]
                    ])
                }
            ],
            [
                'com.example.package2',
                {
                    name: 'com.example.package2',
                    lineRate: 0.6667,
                    classes: new Map<string, types.CoberturaClass>([
                        [
                            'MyClass3.java',
                            {
                                classId: 'MyClass3.java|MyClass3',
                                fileName: 'MyClass3.java',
                                name: 'MyClass3',
                                lineRate: 0.6667,
                                coveredLines: 2,
                                lines: [
                                    { lineNumber: 1, lineHash: 'stu901', hits: 1 },
                                    { lineNumber: 2, lineHash: 'vwx234', hits: 0 },
                                    { lineNumber: 3, lineHash: 'yzab567', hits: 1 }
                                ]
                            }
                        ]
                    ])
                }
            ]
        ])
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

        it('should reject when coverageNode is null', async () => {
            const coverageParserRunner = new runner.CoverageParserRunner();

            sandbox.stub(coverageParserRunner, 'getCoverageNode').returns(null);

            try {
                await coverageParserRunner.run();
                sinon.assert.fail('Expected error to be thrown');
            } catch (error: any) {
                sinon.assert.match(error.message, messages.invalid_coverage_data);
            }
        });

        it('should correctly generate the coverage summary when coverageNode is valid', async () => {
            const coverageParserRunner = new runner.CoverageParserRunner();

            sandbox.stub(coverageParserRunner, 'getCoverageNode').returns(validCoverageNode);
            const addRawStub = sandbox.stub(core.summary, 'addRaw').returns(core.summary);
            const addHeadingStub = sandbox.stub(core.summary, 'addHeading').returns(core.summary);

            await coverageParserRunner.run();

            sinon.assert.calledOnce(addRawStub);
            sinon.assert.calledOnce(addHeadingStub);
            sinon.assert.calledWith(addRawStub, sinon.match.string);
        });
    });
})