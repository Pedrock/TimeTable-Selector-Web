import mapValues from 'lodash/mapValues';
import groupBy from 'lodash/groupBy';
import Vue from 'vue';
import * as mutationTypes from './mutation-types';

export function fetchYears({ commit }) {
  commit(mutationTypes.SET_YEARS_LOADING, true);
  return Promise.resolve(['2017/2018'])
    .then(data => commit(mutationTypes.SET_YEARS, data));
}

export function fetchSchools({ commit }) {
  commit(mutationTypes.SET_SCHOOLS_LOADING, true);
  return Vue.axios.get('faculties')
    .then(({ data }) => commit(mutationTypes.SET_SCHOOLS, data));
}

// eslint-disable-next-line no-unused-vars
export function fetchProgrammes({ commit }, schoolId) { // TODO
  commit(mutationTypes.SET_PROGRAMMES_LOADING, true);
  return Vue.axios.get('courses')
    .then(({ data }) => commit(mutationTypes.SET_PROGRAMMES,
      data.sort((a, b) => a.name.localeCompare(b.name)))); // TODO
}

export function setSchool({ commit, dispatch }, schoolId) {
  commit(mutationTypes.SET_SELECTED_SCHOOL, schoolId);
  return dispatch('fetchProgrammes', schoolId);
}


// eslint-disable-next-line no-unused-vars
async function fetchProgrammeData(programme) {
  const [coursesAll, schedulesAll] = await Promise.all([
    Vue.axios.get('course-units'),
    Vue.axios.get('schedules'),
  ]).then(responses => responses.map(response => response.data));

  const courses = coursesAll.filter(course => course.course_id === programme.id);
  const coursesObj = courses.reduce((obj, c) => ({ ...obj, [c.id]: true }), {});
  const schedules = schedulesAll.filter(({ course_unit_id }) => coursesObj[course_unit_id]);
  const schedulesGrouped = groupBy(schedules, 'course_unit_id');
  const result = courses.map((course) => {
    const courseLessons = schedulesGrouped[course.id] || [];
    return ({
      ...course,
      lectures: courseLessons.filter(l => l.lesson_type === 'T'),
      praticals: courseLessons.filter(l => l.lesson_type !== 'T'),
    });
  });
  console.log(result);
  return result;
}

export function getScheduleData({ commit, state }, programme) {
  commit(mutationTypes.SET_SELECTED_PROGRAMME, programme);
  if (!programme || state.schedule.data[programme]
      || !state.selectedYear || !state.selectedSemester) {
    return Promise.resolve();
  }
  commit(mutationTypes.SET_SCHEDULE_LOADING, true);
  return fetchProgrammeData(programme)
    .then(data => commit(mutationTypes.ADD_SCHEDULE_DATA, { [programme]: data }))
    .finally(() => commit(mutationTypes.SET_SCHEDULE_LOADING, false));
}

export function getMultipleScheduleData({ commit }, programmes) {
  if (programmes.length === 1) {
    commit(mutationTypes.SET_SELECTED_PROGRAMME, programmes[0]);
  }
  commit(mutationTypes.SET_SCHEDULE_LOADING, true);
  const promises = programmes
    .map(p => fetchProgrammeData(p)
      .then(data => commit(mutationTypes.ADD_SCHEDULE_DATA, { [p]: data })));
  return Promise.all(promises)
    .finally(() => commit(mutationTypes.SET_SCHEDULE_LOADING, false));
}

export async function parseUrl({ state, commit, dispatch }, url) {
  // eslint-disable-next-line no-unused-vars
  const [year, semester, ...programmesCourses] = url.split('|');

  commit(mutationTypes.SET_SELECTED_YEAR, year);
  commit(mutationTypes.SET_SELECTED_SEMESTER, Number(semester));

  const programmes = programmesCourses.map(programmeCourses => programmeCourses.split('~', 1)[0]);
  await dispatch('getMultipleScheduleData', programmes);

  programmesCourses.forEach((programmeCourses) => {
    const [programme, ...coursesClasses] = programmeCourses.split('~');
    const data = state.schedule.data[programme];
    const courseToYear = Object.entries(data)
      .reduce((acc, [y, coursesObj]) => ({ ...acc, ...mapValues(coursesObj, () => y) }), {});

    coursesClasses.forEach((courseClass) => {
      const [course, selectedClass] = courseClass.split('.');
      if (courseToYear[course]) {
        const path = [programme, courseToYear[course], course];
        commit(mutationTypes.CHANGE_COURSE_ENABLED, { path, enabled: true });
        commit(mutationTypes.CHANGE_SELECTED_PRACTICAL, { path, selectedClass });
      }
    });
  });
}
