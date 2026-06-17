sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/inc/tremasterscheduler/test/integration/pages/SchedulerConfigList",
	"com/inc/tremasterscheduler/test/integration/pages/SchedulerConfigObjectPage"
], function (JourneyRunner, SchedulerConfigList, SchedulerConfigObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/inc/tremasterscheduler') + '/test/flpSandbox.html#cominctremasterscheduler-tile',
        pages: {
			onTheSchedulerConfigList: SchedulerConfigList,
			onTheSchedulerConfigObjectPage: SchedulerConfigObjectPage
        },
        async: true
    });

    return runner;
});

