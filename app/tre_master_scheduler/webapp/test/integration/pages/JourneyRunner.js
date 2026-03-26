sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"nstremasterscheduler/tremasterscheduler/test/integration/pages/SchedulerConfigList",
	"nstremasterscheduler/tremasterscheduler/test/integration/pages/SchedulerConfigObjectPage"
], function (JourneyRunner, SchedulerConfigList, SchedulerConfigObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('nstremasterscheduler/tremasterscheduler') + '/test/flp.html#app-preview',
        pages: {
			onTheSchedulerConfigList: SchedulerConfigList,
			onTheSchedulerConfigObjectPage: SchedulerConfigObjectPage
        },
        async: true
    });

    return runner;
});

