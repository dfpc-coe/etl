import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        EventLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
                FunctionName: cf.join([cf.stackName, '-events']),
                MemorySize: 512,
                Timeout: 15,
                Description: 'Respond to events on the S3 Asset Bucket',
                ReservedConcurrentExecutions: 20,
                PackageType: 'Image',
                Environment: {
                    Variables: {
                        TAK_ETL_API: cf.ref('HostedURL'),
                        StackName: cf.stackName,
                        SigningSecret: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/api/secret:SecretString::AWSCURRENT}}')
                    }
                },
                Role: cf.getAtt('EventLambdaRole', 'Arn'),
                Code: {
                    ImageUri: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-ecr-etl:events-', cf.ref('GitSha')])
                }
            }
        },
        EventLambdaRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: cf.join([cf.stackName, '-events']),
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'lambda.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Path: '/',
                Policies: [{
                    PolicyName: cf.join([cf.stackName, '-hook-queue']),
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Resource: [
                                cf.join(['arn:', cf.partition, ':s3:::', cf.ref('AssetBucket')]),
                                cf.join(['arn:', cf.partition, ':s3:::', cf.ref('AssetBucket'), '/*'])
                            ],
                            Action: '*'
                        }]
                    }
                }],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'])
                ]
            }
        }
    }
};
